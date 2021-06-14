import { ExtensionContext, commands, extensions, services, LanguageClient } from 'coc.nvim'
// @ts-ignore
import { window } from 'coc.nvim'
import { ExecuteCommandRequest } from 'vscode-languageserver-protocol'
import * as path from 'path'
import * as fs from 'fs'

import { CompletionItemFeature } from './completion'
import { download } from './downloader'

const intellicodeVersion = '1.2.14'
let serverDir: string

export async function activate(context: ExtensionContext): Promise<void> {

  context.subscriptions.push(commands.registerCommand('java.intellicode.download', version => {
    if (!version) {
      version = intellicodeVersion
    }
    checkAndDownload(version)
  }))

  serverDir = path.join(context.extensionPath, 'server')
  if (!fs.existsSync(path.join(serverDir, 'com.microsoft.jdtls.intellicode.core.jar'))) {
    wrappedDownload(intellicodeVersion)
  } else {
    let checkService = () => {
      let service = services.getService('java')
      if (!service) {
        setTimeout(checkService, 100)
        return
      }
      let languageClient: LanguageClient = service.client!
      languageClient.onReady().then(() => {
        languageClient.registerFeature(new CompletionItemFeature(languageClient))
        languageClient.sendRequest(ExecuteCommandRequest.type, {
          command: 'java.intellicode.enable',
          arguments: [true, path.join(context.extensionPath, 'server', 'model')]
        }).then(() => {
          window.showMessage('Java intellicode is enabled')
        }).catch(e => {
          context.logger.error(e)
        })
      })
    }
    setTimeout(checkService, 100)
  }
}

function wrappedDownload(version: string) {
  download(version, serverDir).then(() => {
    // @ts-ignore
    extensions.reloadExtension('coc-java-intellicode')
  })
}

function checkAndDownload(version: string) {
  let versionFile = path.join(serverDir, 'version')
  let localVersion
  if (fs.existsSync(versionFile)) {
    localVersion = fs.readFileSync(versionFile).toString()
  }
  if (localVersion === version) {
    window.showMessage(`Version ${version} has already been installed.`)
  } else {
    wrappedDownload(version)
  }
}
