import { TextDocumentFeature, CompletionItemProvider, BaseLanguageClient, Disposable, ProviderResult, ProvideCompletionItemsSignature, ResolveCompletionItemSignature, sources, languages } from 'coc.nvim'
// @ts-ignore
import { window } from 'coc.nvim'
import { CompletionOptions, CompletionRegistrationOptions, ClientCapabilities, ServerCapabilities, DocumentSelector, ExecuteCommandRequest, Position, CancellationToken, CompletionContext, CompletionList, CompletionItem, CompletionItemKind, CompletionItemTag } from 'vscode-languageserver-protocol'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { v4 as uuidv4 } from 'uuid'

function ensure<T, K extends keyof T>(target: T, key: K): T[K] {
  if (target[key] == null) {
    target[key] = {} as any
  }
  return target[key]
}

const SupportedCompletionItemKinds: CompletionItemKind[] = [
  CompletionItemKind.Text,
  CompletionItemKind.Method,
  CompletionItemKind.Function,
  CompletionItemKind.Constructor,
  CompletionItemKind.Field,
  CompletionItemKind.Variable,
  CompletionItemKind.Class,
  CompletionItemKind.Interface,
  CompletionItemKind.Module,
  CompletionItemKind.Property,
  CompletionItemKind.Unit,
  CompletionItemKind.Value,
  CompletionItemKind.Enum,
  CompletionItemKind.Keyword,
  CompletionItemKind.Snippet,
  CompletionItemKind.Color,
  CompletionItemKind.File,
  CompletionItemKind.Reference,
  CompletionItemKind.Folder,
  CompletionItemKind.EnumMember,
  CompletionItemKind.Constant,
  CompletionItemKind.Struct,
  CompletionItemKind.Event,
  CompletionItemKind.Operator,
  CompletionItemKind.TypeParameter
]

export class CompletionItemFeature extends TextDocumentFeature<CompletionOptions, CompletionRegistrationOptions, CompletionItemProvider> {
  private index: number
  constructor(client: BaseLanguageClient) {
    super(client, ExecuteCommandRequest.type)
  }

  public fillClientCapabilities(capabilites: ClientCapabilities): void {
    let snippetSupport = this._client.clientOptions.disableSnippetCompletion !== true
    let completion = ensure(ensure(capabilites, 'textDocument')!, 'completion')!
    completion.dynamicRegistration = true
    completion.contextSupport = true
    completion.completionItem = {
      snippetSupport,
      commitCharactersSupport: true,
      // @ts-ignore
      documentationFormat: this._client.supporedMarkupKind,
      deprecatedSupport: true,
      preselectSupport: true,
      tagSupport: { valueSet: [CompletionItemTag.Deprecated] },
    }
    completion.completionItemKind = { valueSet: SupportedCompletionItemKinds }
  }

  public initialize(
    capabilities: ServerCapabilities,
    documentSelector: DocumentSelector
  ): void {
    this.index = 0
    const options = this.getRegistrationOptions(documentSelector, capabilities.completionProvider)
    if (!options) {
      return
    }
    this.register(this.messages, {
      id: uuidv4(),
      registerOptions: options
    })
  }

  protected registerLanguageProvider(options: CompletionRegistrationOptions): [Disposable, CompletionItemProvider] {
    let triggerCharacters = options.triggerCharacters || []
    let allCommitCharacters = options.allCommitCharacters || []
    let priority = (options as any).priority as number
    const provider: CompletionItemProvider = {
      provideCompletionItems: (document: TextDocument, position: Position, token: CancellationToken, context: CompletionContext): ProviderResult<CompletionList | CompletionItem[]> => {
        const client = this._client
        const middleware = this._client.clientOptions.middleware!
      // @ts-ignore
        const provideCompletionItems: ProvideCompletionItemsSignature = (document, position, context, token) => {
          return client.sendRequest(
            ExecuteCommandRequest.type,
            {
              command: 'java.intellicode.completion',
              arguments: [
                { textDocument: { uri: document.uri }, position, context }
              ]
            },
            token
          ).then(result => {
            return result
          }, error => {
            client.logFailedRequest(ExecuteCommandRequest.type, error)
            return Promise.resolve([])
          })
        }

        return middleware.provideCompletionItem
          ? middleware.provideCompletionItem(document, position, context, token, provideCompletionItems)
          : provideCompletionItems(document, position, context, token)
      },
      resolveCompletionItem: options.resolveProvider
        ? (item: CompletionItem, token: CancellationToken): ProviderResult<CompletionItem> => {
          const client = this._client
          const middleware = this._client.clientOptions.middleware!
          // @ts-ignore
          const resolveCompletionItem: ResolveCompletionItemSignature = (item, token) => {
            return client.sendRequest(
              ExecuteCommandRequest.type,
              {
                command: 'java.intellicode.completion.resolve',
                arguments: [{ item }]
              },
              token
            ).then(res => res, error => {
              client.logFailedRequest(ExecuteCommandRequest.type, error)
              return Promise.resolve(item)
            })
          }

          return middleware.resolveCompletionItem
            ? middleware.resolveCompletionItem(item, token, resolveCompletionItem)
            : resolveCompletionItem(item, token)
        }
        : undefined
    }
    let name = 'intellicode'
    sources.removeSource(name)
    const disposable = languages.registerCompletionItemProvider(
      name,
      'LS',
      // @ts-ignore
      options.documentSelector || this._client.clientOptions.documentSelector,
      provider,
      triggerCharacters,
      priority,
      allCommitCharacters)
    let source = sources.getSource('intellicode')!
    source.triggerPatterns = [new RegExp(".*")]
    this.index = this.index + 1
    return [disposable, provider]
  }
}
