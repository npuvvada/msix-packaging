import path = require('path');
import tl = require('azure-pipelines-task-lib/task')

import { ToolRunner } from 'azure-pipelines-task-lib/toolrunner';

import helpers = require('common/helpers');

const MSIXMGR_PATH = path.join(__dirname, 'lib', 'msixmgr');
const GENERATE_VHDX_SCRIPT_PATH = path.join(__dirname, 'GenerateAppAttachVhdx.ps1')
const HELPER_SCRIPT = path.join(__dirname, 'PublishAVD.ps1');
const TARGET_DLL = path.join(__dirname, 'node_modules/common-helpers/lib/AppAttachFrameworkDLL/AppAttachKernel.dll');

/**
 * Main function for the task.
 */
const run = async () =>
{
    tl.setResourcePath(path.join(__dirname, 'task.json'));

    // Read the task's inputs
    const packagePath: string = helpers.getInputWithErrorCheck('package', 'No package path specified.');
    const vhdxPath: string = helpers.getInputWithErrorCheck('vhdxOutputPath', 'A path is needed to create a new VHDX file, but none was given.');

    // The script requires the command path to be absolute.
    const fullVhdxPath: string = path.resolve(vhdxPath);
	const vhdxGenerationConfig = {
		'startValue': 'GENERATE ARTIFACT',
		'endValue': 'GENERATE ARTIFACT',
		'packagePath': packagePath,
        'imagePath': fullVhdxPath,
		'msixManagerPath': MSIXMGR_PATH,
        'clientType': helpers.CLIENT_TYPE,
        'clientVersion': helpers.CLIENT_VERSION
	}
		
    const powershellRunner: ToolRunner = helpers.getPowershellRunner(HELPER_SCRIPT);
    powershellRunner.arg(['-inputJsonStr', '\'' + vhdxGenerationConfig + '\'']);
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