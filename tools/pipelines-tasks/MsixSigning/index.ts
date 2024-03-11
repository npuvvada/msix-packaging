import path = require('path');
import tl = require('azure-pipelines-task-lib/task')
import { ToolRunner } from 'azure-pipelines-task-lib/toolrunner';

import helpers = require('common/helpers');

import download = require('./predownloadsecurefile');

const SIGNTOOL_PATH = path.join(__dirname, 'lib', 'signtool');
const IMPORT_CERT_SCRIPT_PATH = path.join(__dirname, 'ImportCert.ps1');
const HELPER_SCRIPT = path.join(__dirname, 'PublishAVD.ps1');
const TARGET_DLL = path.join(__dirname, 'node_modules/common-helpers/lib/AppAttachFrameworkDLL/AppAttachKernel.dll');

/**
 * Definition of how to sign with a kind of certificate (e.g. file or file encoded as string).
 * Implementations of this should read the needed task inputs during construction.
 */
interface SigningType
{

    /**
     * Prepares the certificate to use.
     */
    prepareCert(): Promise<void>,
    /**
     * Does any cleanup needed for the certificate.
     */
    cleanupCert(): void,

    signParams: Map<string, string>;
}

/**
 * Sign with a .pfx file downloaded from the pipeline's secure files.
 */
class SecureFileSigningType implements SigningType
{
    // ID of the secure .pfx file to download.
    secureFileId: string;
    // Password to the .pfx.
    password?: string;
    // Path to the downloaded file
    certFilePath?: string;
    // Signing parameters: certificate path and password
    signParams: Map<string, string> = new Map<string, string>();


    constructor()
    {
        this.secureFileId = tl.getInput('certificate', /* required */ true)!;

        // Get the certificate password.
        // Instead of parsing a password for the certificate as a plain string, we attempt to get the password as
        // a secret variable saved to the pipeline from a variable group.
        // No password variable means the certificate doesn't need a password.
        const passwordVariable: string | undefined = tl.getInput('passwordVariable');
        if (passwordVariable)
        {
            this.password = tl.getVariable(passwordVariable);
            if (this.password === undefined)
            {
                throw Error('The secret variable given does not point to a valid password.');
            }
            this.signParams.set("certificatePassword", this.password);
        }
    }

    // Download the pfx file
    async prepareCert(): Promise<void>
    {
        this.certFilePath = await download.downloadSecureFile(this.secureFileId);
        this.signParams.set("certificatePath", this.certFilePath);
    }

    // Delete the downloaded file
    cleanupCert()
    {
        download.deleteSecureFile(this.secureFileId);
    }
}

/**
 * Sign with a pfx encoded as a string, as downloaded from Azure Key Vault
 */
class Base64EncodedCertSigningType implements SigningType
{
    // Certificate encoded as a string
    public base64String: string;
    // Certificate hash/thumbprint for identification
    public certThumbprint?: string;
    // signing parameters: base64 encoded string
    signParams: Map<string, string> = new Map<string, string>();

    constructor()
    {
        this.base64String = tl.getInput('encodedCertificate', /* required */ true)!;
    }

    async prepareCert(): Promise<void>
    {
    }

    cleanupCert()
    {
    }
}

/**
 * Main function for the task.
 */
const run = async () =>
{
    tl.setResourcePath(path.join(__dirname, 'task.json'));

    const packagePathPattern: string = tl.getInput('package', /* required */ true)!;
    const signingConfig = new Map<string, string>();
    signingConfig.set("packagePath", packagePathPattern);
    signingConfig.set("startValue", "SIGN PACKAGE");
    signingConfig.set("endValue", "SIGN PACKAGE");
    signingConfig.set("clientName", helpers.CLIENT_TYPE);
    signingConfig.set("clientVersion", helpers.CLIENT_VERSION);

    // Get the certificate info.
    var signingType: SigningType;
    const certificateType: string | undefined = tl.getInput('certificateType');
    if (certificateType == 'base64') {
        tl.debug('Using base64-encoded certificate');
        signingType = new Base64EncodedCertSigningType();
        await signingType.prepareCert();
        signingConfig.set("encodedCertificate", signingType.signParams.get("encodedCertificate")!);
    }
    else {
        tl.debug('Using secure file certificate');
        signingType = new SecureFileSigningType();
        await signingType.prepareCert();
        signingConfig.set("certificatePath", signingType.signParams.get("certificatePath")!);
        signingConfig.set("certificatePassword", signingType.signParams.get("certificatePassword")!);
    }

    // No time stamp server means to not add a time stamp.
    const timeStampServer: string | undefined = tl.getInput('timeStampServer');
    if (timeStampServer) {
        signingConfig.set("timeStampServer", signingType.signParams.get("timeStampServer")!);
    }

    const powershellRunner: ToolRunner = helpers.getPowershellRunner(HELPER_SCRIPT);
    powershellRunner.arg(['-inputJsonStr', '\'' + signingConfig + '\'']);
    powershellRunner.arg(['-targetDLL', TARGET_DLL]);

    let execResult = await powershellRunner.execSync();
    if (execResult.code) {
        throw execResult.stderr;
    }
    signingType.cleanupCert();
}

run().catch(err =>
    {
        tl.setResult(tl.TaskResult.Failed, err.message);
    })