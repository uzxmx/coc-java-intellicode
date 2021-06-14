import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { workspace } from 'coc.nvim'
// @ts-ignore
import { window } from 'coc.nvim'
import compressing from 'compressing'
import got from 'got'
import tunnel from 'tunnel'

function deleteDirectory(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).forEach(child => {
      let entry = path.join(dir, child)
      if (fs.lstatSync(entry).isDirectory()) {
        deleteDirectory(entry)
      } else {
        fs.unlinkSync(entry)
      }
    })
    fs.rmdirSync(dir)
  }
}

function getOptions() {
  let config = workspace.getConfiguration('http')
  let proxy = config.get<string>('proxy', '')
  let options: any = { encoding: null }
  if (proxy) {
    let parts = proxy.replace(/^https?:\/\//, '').split(':', 2)
    options.agent = tunnel.httpsOverHttp({
      proxy: {
        headers: {},
        host: parts[0],
        port: Number(parts[1])
      }
    })
  }
  return options
}

export async function download(version: string, dir: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    downloadJar(version, dir).then(() => {
      downloadModel(dir).then(() => {
        fs.writeFileSync(path.join(dir, 'version'), version)
        resolve()
      }).catch(reject)
    }).catch(reject)
  })
}

function downloadJar(version, dir) {
  let statusItem = window.createStatusBarItem(0, { progress: true })
  statusItem.text = 'Downloading intellicode'
  statusItem.show()

  return new Promise<void>((resolve, reject) => {
    let stream = got.stream(`https://marketplace.visualstudio.com/_apis/public/gallery/publishers/VisualStudioExptTeam/vsextensions/vscodeintellicode/${version}/vspackage`, getOptions())
      .on('downloadProgress', progress => {
      let p = (progress.percent * 100).toFixed(0)
      statusItem.text = `${p}% Downloading intellicode`
    })

    let tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coc-java-intellicode-'))
    compressing.zip.uncompress(stream as any, tmpDir)
    .then(() => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir)
      }
      let dist = path.join(tmpDir, 'extension', 'dist')
      let name = fs.readdirSync(dist).filter(f => f.match('com.microsoft.jdtls.intellicode.core-.*.jar'))[0]
      fs.copyFileSync(path.join(dist, name), path.join(dir, 'com.microsoft.jdtls.intellicode.core.jar'))

      deleteDirectory(tmpDir)
      statusItem.dispose()
      resolve()
    })
    .catch(e => {
      // tslint:disable-next-line: no-console
      console.error(e)
      deleteDirectory(tmpDir)
      statusItem.dispose()
      reject(e)
    })
  })
}

function downloadModel(dir) {
  return new Promise<void>((resolve, reject) => {
    got.get('https://prod.intellicode.vsengsaas.visualstudio.com/api/v1/model/common/java/intellisense-members/output/latest', getOptions()).then(resp => {
      let json = JSON.parse(resp.body)

      let statusItem = window.createStatusBarItem(0, { progress: true })
      statusItem.text = 'Downloading intellicode model'
      statusItem.show()

      let stream = got.stream(json.output.blob.azureBlobStorage.readSasToken, getOptions())
        .on('downloadProgress', progress => {
          let p = (progress.percent * 100).toFixed(0)
          statusItem.text = `${p}% Downloading intellicode model`
        })
        .on('error', e => {
          statusItem.dispose()
          reject(e)
        })

      let writeStream = fs.createWriteStream(path.join(dir, 'model'))
      writeStream.on('finish', () =>{
        statusItem.dispose()
        resolve()
      }).on('error', e => {
        statusItem.dispose()
        reject(e)
      })

      stream.pipe(writeStream)
    }).catch(reject)
  })
}
