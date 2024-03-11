import os = require('os');
import path = require('path');
import tl = require('azure-pipelines-task-lib/task');
import msbuildHelpers = require('azure-pipelines-tasks-msbuildhelpers');
import { ToolRunner } from 'azure-pipelines-task-lib/toolrunner';

import helpers = require('common/helpers');
const MSBUILD_PATH_HELPER_SCRIPT = path.join(__dirname, 'GetMSBuildPath.ps1');

/**
 * Reads the task's inputs related to MSBuild that are common to creating packages and bundle.
 */
export const setMSBuildInputs = async (buildPackageConfig: Map<string, string>): Promise<void> =>
{
    const solution: string = helpers.getInputWithErrorCheck('solution', 'A path to a solution is required.');
    buildPackageConfig.set("projectFilePath", solution);
    const configuration: string = helpers.getInputWithErrorCheck('buildConfiguration', 'Build configuration is required.');
    buildPackageConfig.set("configuration", configuration);

    const clean: boolean = tl.getBoolInput('clean');
    if (clean) {
        buildPackageConfig.set("cleanFlag", "true");
    }
    const appxPackageBuildMode: string = tl.getInput('appPackageDistributionMode') ?? 'SideloadOnly'
    buildPackageConfig.set("appPackageDistributionMode", appxPackageBuildMode);

    const msbuildLocationMethod: string = helpers.getInputWithErrorCheck('msBuildLocationMethod', 'Method to locate MSBuild is required.');

    let msbuildVersion: string | undefined;
    let msbuildArchitecture: string | undefined;
    if (msbuildLocationMethod === 'version')
    {
        msbuildVersion = helpers.getInputWithErrorCheck('msbuildVersion', 'Version of MSBuild to use is required.');
        msbuildArchitecture = helpers.getInputWithErrorCheck('msbuildArchitecture', 'Build architecture of MSBuild to use is required.');
    }

    let msbuildLocation: string | undefined;
    if (msbuildLocationMethod === 'location')
    {
        msbuildLocation = helpers.getInputWithErrorCheck('msbuildLocation', 'Location of MSBuild.exe is required.');
    }

    const msbuildTool: string = msbuildLocationMethod === 'location' ? msbuildLocation! : await getMSBuildPathFromVersion(msbuildVersion!, msbuildArchitecture!);
    buildPackageConfig.set("msbuildPath", msbuildTool);
}

const getMSBuildPathFromVersion = async (msbuildVersion: string, msbuildArchitecture: string): Promise<string> =>
{
    const osPlatform: string = os.platform();
    if (osPlatform === 'win32')
    {
        // The Powershell helper only works on Windows;
        // it looks in the Global Assembly Cache to find the right version.
        // We use a wrapper script to call the right function from the helper.
        const powershellRunner: ToolRunner = helpers.getPowershellRunner(MSBUILD_PATH_HELPER_SCRIPT);
        powershellRunner.arg(['-PreferredVersion', msbuildVersion]);
        powershellRunner.arg(['-Architecture', msbuildArchitecture]);

        const execResult = powershellRunner.execSync();
        if (execResult.code)
        {
            throw execResult.stderr;
        }

        return execResult.stdout.trim();
    }
    else
    {
        // The TypeScript helper only works on Mac and Linux.
        return await msbuildHelpers.getMSBuildPath(msbuildVersion);
    }
}

