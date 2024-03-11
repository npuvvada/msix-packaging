import path = require('path');
import tl = require('azure-pipelines-task-lib/task')
import { ToolRunner } from 'azure-pipelines-task-lib/toolrunner';

import helpers = require('common/helpers');

import msbuild = require('./msbuild');
import { platform } from 'os';

const HELPER_SCRIPT = path.join(__dirname, 'PublishAVD.ps1');
const TARGET_DLL = path.join(__dirname, 'node_modules/common-helpers/lib/AppAttachFrameworkDLL/AppAttachKernel.dll');

/**
 * Gets the list of platforms to build from the input.
 */
const getPlatformsToBuild = (): string[] =>
{
    const allPlatforms: { [platform: string]: boolean } =
    {
        'x86': tl.getBoolInput('buildForX86'),
        'x64': tl.getBoolInput('buildForX64'),
        'ARM': tl.getBoolInput('buildForArm'),
        'Any CPU': tl.getBoolInput('buildForAnyCpu')
    };

    const selectedPlatforms: string[] = [];
    Object.keys(allPlatforms).forEach(key =>
    {
        if (allPlatforms[key])
        {
            selectedPlatforms.push(key);
        }
    });

    return selectedPlatforms;
}

/**
 * Main function for the task.
 */
const run = async () =>
{
    tl.setResourcePath(path.join(__dirname, 'task.json'));

    const buildPackageConfig = new Map<string, string>();
    buildPackageConfig.set("startValue", "BUILD");
    buildPackageConfig.set("endValue", "GENERATE MSIX");
    buildPackageConfig.set("clientName", helpers.CLIENT_TYPE);
    buildPackageConfig.set("clientVersion", helpers.CLIENT_VERSION);

    // detect if the user will provide pre-built binaries or use MSBuild
    const buildSolution: boolean = tl.getBoolInput('buildSolution', /* required: */ true);
    let inputDirectory: string | undefined;
    if (!buildSolution) {
        inputDirectory = helpers.getInputWithErrorCheck('inputDirectory', 'To package pre-built binaries, a path to the directory containing valid binaries is required, but none was given.');
        buildPackageConfig.set("startValue", "GENERATE MSIX");
        buildPackageConfig.set("inputPackageFilesDirectory", inputDirectory);
        buildPackageConfig.set("makeappxPath", helpers.MAKEAPPX_PATH);
    }

    // read output path for the package or bundle.
    // resolve it to a full path to ensure it is the same in every place.
    // e.g. MSBuild seems to use the path relative to the solution dir in some cases.
    const outputPath: string = path.resolve(helpers.getInputWithErrorCheck('outputPath', 'An output path is required to save the package, but none was given.'));
    buildPackageConfig.set("startValue", "GENERATE MSIX");
    buildPackageConfig.set("packageLocation", path.dirname(outputPath));
    buildPackageConfig.set("packageName",path.basename(outputPath));

    // whether to bundle or not is independent of whether or not to build from scratch
    // if the user gives the bundle option, check that they gave a path to save the output bundle.
    const generateBundle: boolean = tl.getBoolInput('generateBundle');
    if (generateBundle) {
        const platformsToBuild: string[] = getPlatformsToBuild();
        if (!platformsToBuild.length) {
            throw Error('No platform was specified to be built.');
        }
        buildPackageConfig.set("bundleFlag", generateBundle.toString());
        buildPackageConfig.set("bundlePlatforms", platformsToBuild.join('|'));
    }
    else {
        const platform: string = helpers.getInputWithErrorCheck('buildPlatform', 'Platform to build is required.');
        buildPackageConfig.set("platform", platform);
    }

    // update the app version in the manifest
    const updateAppVersion: boolean = tl.getBoolInput('updateAppVersion');
    if (updateAppVersion)
    {
        // read the input
        const manifestFile: string = helpers.getInputWithErrorCheck('manifestFile', 'To update the version of the app, the path to the manifest file is required to get the current version, but none was given.');
        buildPackageConfig.set("appxManifestFile", manifestFile);

        // get the new version
        let newVersion: string = helpers.getInputWithErrorCheck('appVersion', 'To manually update the version of the app, a new version is required but none was given.');
        buildPackageConfig.set("packageVersion", newVersion);
    }

    if (buildSolution) {
        msbuild.setMSBuildInputs(buildPackageConfig);
    }

    const powershellRunner: ToolRunner = helpers.getPowershellRunner(HELPER_SCRIPT);
    powershellRunner.arg(['-inputJsonStr', '\'' + buildPackageConfig + '\'']);
    powershellRunner.arg(['-targetDLL', TARGET_DLL]);

    let execResult = await powershellRunner.execSync();
    if (execResult.code) {
        throw execResult.stderr;
    }
}

run().catch(err =>
    {
        tl.setResult(tl.TaskResult.Failed, err.message);
    })