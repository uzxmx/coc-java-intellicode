import { workspace, CompletionItemProvider, Disposable, ProviderResult,
  ProvideCompletionItemsSignature, ResolveCompletionItemSignature, sources,
  languages, TextDocument, Position, CancellationToken, CompletionContext, CompletionItem, CompletionList } from 'coc.nvim'
// @ts-ignore
import { window } from 'coc.nvim'
import { CompletionOptions, CompletionRegistrationOptions, ClientCapabilities, ServerCapabilities, DocumentSelector, ExecuteCommandRequest, CompletionItemKind, CompletionItemTag, TextDocumentRegistrationOptions, InitializeParams, RegistrationType, StaticRegistrationOptions, WorkDoneProgressOptions, CompletionRequest } from 'vscode-languageserver-protocol'
// import { TextDocument } from 'vscode-languageserver-textdocument'
import { v4 as uuidv4 } from 'uuid'

function ensure<T, K extends keyof T>(target: T, key: K): T[K] {
  if (target[key] == null) {
    target[key] = {} as any
  }
  return target[key]
}

export interface RegistrationData<T> {
  id: string
  registerOptions: T
}

export interface DynamicFeature<RO> {

  /**
   * Called to fill the initialize params.
   *
   * @params the initialize params.
   */
  fillInitializeParams?: (params: InitializeParams) => void

  /**
   * Called to fill in the client capabilities this feature implements.
   *
   * @param capabilities The client capabilities to fill.
   */
  fillClientCapabilities(capabilities: ClientCapabilities): void

  /**
   * Initialize the feature. This method is called on a feature instance
   * when the client has successfully received the initialize request from
   * the server and before the client sends the initialized notification
   * to the server.
   *
   * @param capabilities the server capabilities.
   * @param documentSelector the document selector pass to the client's constructor.
   *  May be `undefined` if the client was created without a selector.
   */
  initialize(
    capabilities: ServerCapabilities,
    documentSelector: DocumentSelector | undefined
  ): void

  /**
   * The signature (e.g. method) for which this features support dynamic activation / registration.
   */
  registrationType: RegistrationType<RO>

  /**
   * Is called when the server send a register request for the given message.
   *
   * @param data additional registration data as defined in the protocol.
   */
  register(data: RegistrationData<RO>): void

  /**
   * Is called when the server wants to unregister a feature.
   *
   * @param id the id used when registering the feature.
   */
  unregister(id: string): void

  /**
   * Called when the client is stopped to dispose this feature. Usually a feature
   * unregisters listeners registered hooked up with the VS Code extension host.
   */
  dispose(): void
}

interface TextDocumentFeatureRegistration<RO, PR> {
  disposable: Disposable
  data: RegistrationData<RO>
  provider: PR
}

export abstract class TextDocumentFeature<
  PO, RO extends TextDocumentRegistrationOptions & PO, PR
  > implements DynamicFeature<RO> {
  private _registrations: Map<string, TextDocumentFeatureRegistration<RO, PR>> = new Map()

  constructor(
    protected _client: any,
    private _registrationType: RegistrationType<RO>
  ) {}

  public get registrationType(): RegistrationType<RO> {
    return this._registrationType
  }

  public abstract fillClientCapabilities(capabilities: ClientCapabilities): void

  public abstract initialize(
    capabilities: ServerCapabilities,
    documentSelector: DocumentSelector
  ): void

  public register(data: RegistrationData<RO>): void {
    if (!data.registerOptions.documentSelector) {
      return
    }
    let registration = this.registerLanguageProvider(data.registerOptions)
    this._registrations.set(data.id, { disposable: registration[0], data, provider: registration[1] })
  }

  protected abstract registerLanguageProvider(options: RO): [Disposable, PR]

  public unregister(id: string): void {
    let registration = this._registrations.get(id)
    if (registration) {
      registration.disposable.dispose()
    }
  }

  public dispose(): void {
    this._registrations.forEach(value => {
      value.disposable.dispose()
    })
    this._registrations.clear()
  }

  protected getRegistration(documentSelector: DocumentSelector | undefined, capability: undefined | PO | (RO & StaticRegistrationOptions)): [string | undefined, (RO & { documentSelector: DocumentSelector }) | undefined] {
    if (!capability) {
      return [undefined, undefined]
    } else if (TextDocumentRegistrationOptions.is(capability)) {
      const id = StaticRegistrationOptions.hasId(capability) ? capability.id : uuidv4()
      const selector = capability.documentSelector || documentSelector
      if (selector) {
        return [id, Object.assign({}, capability, { documentSelector: selector })]
      }
    } else if (typeof capability === 'boolean' && capability === true || WorkDoneProgressOptions.is(capability)) {
      if (!documentSelector) {
        return [undefined, undefined]
      }
      let options: RO & { documentSelector: DocumentSelector } = (typeof capability === 'boolean' && capability === true ? { documentSelector } : Object.assign({}, capability, { documentSelector })) as any
      return [uuidv4(), options]
    }
    return [undefined, undefined]
  }

  protected getRegistrationOptions(documentSelector: DocumentSelector | undefined, capability: undefined | PO): (RO & { documentSelector: DocumentSelector }) | undefined {
    if (!documentSelector || !capability) {
      return undefined
    }
    return (typeof capability === 'boolean' && capability === true ? { documentSelector } : Object.assign({}, capability, { documentSelector })) as RO & { documentSelector: DocumentSelector }
  }

  public getProvider(textDocument: TextDocument): PR | undefined {
    for (const registration of this._registrations.values()) {
      let selector = registration.data.registerOptions.documentSelector
      if (selector !== null && workspace.match(selector, textDocument) > 0) {
        return registration.provider
      }
    }
    return undefined
  }

  protected getAllProviders(): Iterable<PR> {
    const result: PR[] = []
    for (const item of this._registrations.values()) {
      result.push(item.provider)
    }
    return result
  }
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
  constructor(client: any) {
    super(client, CompletionRequest.type)
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
    this.register({
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
            // ExecuteCommandRequest.type,
            CompletionRequest.type,
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
