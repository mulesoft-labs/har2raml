/// <reference path="../typings/main.d.ts" />

import fs=require('fs')
import path=require('path')
import mkdirp=require('mkdirp')

import schemaGenerator=require('./schemaGenerator')

export interface IRamlElement{
    serialize(shift:string,shiftsCount:number):string
}

export interface IResourceOwner extends IRamlElement{

    uri:string

    resources():{[key:string]:IRawResource}

    resourcesArray():IRawResource[]

    getOrCreateResource(segment:string):IRawResource

    ownerApi:IRawApi

    init()

    setOwnerApi(api:IRawApi)
}

export class BasicResourceOwner implements IResourceOwner{

    constructor(uri:string){
        this.uri = uri
    }

    protected _resources:{[key:string]:IRawResource} = {}

    ownerApi:IRawApi

    resources():{[key:string]:IRawResource}{return this._resources}
    
    uri:string

    resourcesArray():IRawResource[]{
        return Object.keys(this.resources()).map(x=>this._resources[x])
    }

    getOrCreateResource(segment:string):IRawResource {
        var res:IRawResource = this.resources()[segment]
        if (!res) {
            res = new RawResource(segment,this.uri+segment,this.ownerApi)
            this.resources()[segment] = res
        }
        return res;
    }
    serialize(shift:string,shiftsCount:number):string{
        var buf:string[] = []
        Object.keys(this.resources()).forEach(
            x => buf.push(this.resources()[x].serialize(shift,shiftsCount))
        )
        var result = buf.join('\n');
        return result
    }

    setOwnerApi(api:IRawApi){
        this.ownerApi = api
        if(this.uri.indexOf(api.baseUri())==0){
            this.uri = this.uri.substring(api.baseUri().length)
            if(this.uri.indexOf('/')!=0){
                this.uri = '/' + this.uri
            }
        }
        Object.keys(this.resources()).forEach(x=>this.resources()[x].setOwnerApi(api))
    }

    init(){
        var resMap = this.resources()
        Object.keys(resMap).forEach(x=>{
            var res:IRawResource = this.resources()[x]
            var methods = res.methods()
            Object.keys(methods).forEach(y=>{
                var method:IRawMethod = res.methods()[y]
                method.body()
                method.responses()
            })
            res.init()
        })
    }
}

/**
 * Raw resource representation
 */
export interface IRawApi extends IResourceOwner{

    baseUri():string

    title():string
    
    setTitle(title:string)

    globalSchemas:{[key:string]:ExternalFile}

    globalExamples:{[key:string]:ExternalFile}
}

export class RawApi extends BasicResourceOwner implements IRawApi{

    constructor(title:string,baseUri:string){
        super('')
        this._title= title
        this._baseUri = baseUri
        this.ownerApi = this
    }

    private _title:string

    private _baseUri:string

    globalSchemas:{[key:string]:ExternalFile} = {}

    globalExamples:{[key:string]:ExternalFile} = {}

    baseUri():string{return this._baseUri}

    title():string{return this._title}
    
    setTitle(title:string){
        this._title = title
    }

    serialize(shift:string,shiftsCount:number):string{

        this.init()

        var buf:string[] = []
        var ind:string = indent(shift, shiftsCount);
        buf.push( ind + '#%RAML 0.8' )
        buf.push( ind + 'title: ' + this.title() )
        buf.push( ind + 'version: v1' )
        buf.push( ind + 'baseUri: ' + this.baseUri() )

        var schemaKeys:string[] = Object.keys(this.globalSchemas)
        if(schemaKeys.length>0){
            buf.push( ind + 'schemas:' )
            var ind1 = indent(shift, shiftsCount + 1);
            schemaKeys.forEach(x=>{
                var file = this.globalSchemas[x]
                buf.push(ind1 + "- "+file.name() + ': ' + file.getIncludeString() )
            })
        }
        var resourcesSerialized = super.serialize(shift, shiftsCount);
        if(resourcesSerialized.length>0) {
            buf.push(resourcesSerialized)
        }
        var result = buf.join('\n');
        return result
    }
}

/**
 * Raw resource representation
 */
export interface IRawResource extends IResourceOwner{

    segment():string

    methods():{[key:string]:IRawMethod}
    
    methodsArray():IRawMethod[]    

    addCall(call:IMethodCall)
}

export class RawResource extends BasicResourceOwner implements IRawResource{

    constructor(segment:string,uri:string,api:IRawApi){
        super(uri)
        this._segment = segment
        this.ownerApi = api
    }

    _segment:string

    private _entries:{[key:string]:IRawMethod} = {}

    segment(){ return this._segment }

    methods():{[key:string]:IRawMethod}{return this._entries}
    
    methodsArray():IRawMethod[]{
        var array:IRawMethod[] = []
        Object.keys(this.methods()).forEach(x=>array.push(this._entries[x]))
        return array
    }

    addCall(call:IMethodCall){
        var httpType:string = call.httpType()
        var method:IRawMethod = this.methods()[httpType]
        if(method){
            method.calls().push(call)
        }
        else{
            method = new RawMethod(call,this)
            this.methods()[httpType] = method
        }
    }

    serialize(shift:string,shiftsCount:number):string{
        var buf:string[] = []
        buf.push( indent(shift, shiftsCount) + this.segment() + ':')
        Object.keys(this.methods()).forEach(
            x => buf.push(this.methods()[x].serialize(shift,shiftsCount+1))
        )
        var resourcesSerialized = super.serialize(shift, shiftsCount+1);
        if(resourcesSerialized.length>0) {
            buf.push(resourcesSerialized)
        }
        var result = buf.join('\n');
        return result
    }
}


export class RawCompositeResource extends RawResource{

    constructor(segment:string,uri:string,api:IRawApi,parts?:IRawResource[]){
         super(segment,uri,api)
         if(parts){
             parts.forEach(x=>this.parts[x.segment()]=x)
         }
    }

    parts:{[key:string]:IRawResource} = {}
}

export class BodyOwner implements IRamlElement{

    protected _body:{[key:string]:Body[]}

    body():{[key:string]:Body[]}{
        return this._body
    }

    serialize(shift:string,shiftsCount:number):string{
        var buf:string[] = []
        var consumedTypes = Object.keys(this.body())
        if(consumedTypes.length>0){
            buf.push( indent(shift,shiftsCount) + 'body:')
            consumedTypes.forEach(x=>{
                var bodies:Body[] = this.body()[x]
                if(bodies&&bodies.length>0){
                    buf.push(bodies[0].serialize(shift,shiftsCount+1))
                }
            })
        }
        var result = buf.join('\n');
        return result
    }
}

/**
 * Raw method representation
 */
export interface IRawMethod extends IRamlElement{

    calls():IMethodCall[]

    url():string

    httpType():string

    queryParams():{[key:string]:IRawParam}

    body():{[key:string]:Body[]}

    responses():{[key:string]:RawResponse}
}

export class RawAbstractMethod extends BodyOwner implements IRawMethod{

    constructor(httpType:string,url:string,resource:IRawResource){
        super()
        this._httpType = httpType
        this._url = url
        this.resource = resource
    }

    protected resource:IRawResource

    private _httpType:string

    private _url:string

    private _queryParams:{[key:string]:IRawParam}

    private _responses:{[key:string]:RawResponse}

    calls():IMethodCall[]{return undefined }

    url():string{ return this._url }

    httpType():string{ return this._httpType }

    queryParams():{[key:string]:IRawParam}{

        if(!this._queryParams&&this.calls().length>0) {
            var map:{[key:string]:IRawParam} = {}
            this.calls().forEach(x=> {
                var usecases:{[key:string]:ParamUsecase} = x.queryParams()
                Object.keys(usecases).forEach(name=> {
                    var param:IRawParam = map[name]
                    if (!param) {
                        param = new RawParam(name)
                        map[name] = param
                    }
                    param.addUsecase(usecases[name])
                })
            })
            this._queryParams = map
        }
        return this._queryParams
    }

    body():{[key:string]:Body[]}{
        if(!this._body&&this.calls().length>0){
            var map:{[key:string]:Body[]} = {}
            this.calls().forEach(x=> {
                var body:Body = x.body()
                if (body) {
                    var arr:Body[] = map[body.mediaType()]
                    if (!arr) {
                        arr = []
                        map[body.mediaType()] = arr
                        this.registerSchemaAndExample(body,'Request')
                    }
                    arr.push(body)
                }
            })
            this._body = map
        }
        return this._body
    }

    responses():{[key:string]:RawResponse}{
        if(!this._responses&&this.calls().length>0){
            var map:{[key:string]:RawResponse} = {}
            this.calls().forEach(x=>{
                var code:string = x.responseCode()
                var body:Body = x.response()
                var response:RawResponse = map[code]
                if(!response){
                    response = new RawResponse(code)
                    map[code] = response
                    this.registerSchemaAndExample(body,'Response')
                }
                response.addBody(body)
            })
            this._responses = map
        }
        return this._responses
    }

    private registerSchemaAndExample(body:Body,fileRole:string){
        var name:string = this.resource.segment().replace(new RegExp('[^a-zA-Z0-9]','g'), '')
        if(name.length>40){
            name = name.substring(0,40)
        }
        var getIcludeString = ExternalFile.prototype.getIncludeString;
        var setExampleInclude = Body.prototype.setExampleInclude
        var getExample = Body.prototype.example
        var getName = ExternalFile.prototype.name;
        var setGlobalSchema = Body.prototype.setGlobalSchema
        var getSchema = Body.prototype.schema
        this.registerExternalFile(this.resource.ownerApi.globalExamples, name, 'example', fileRole, body, getIcludeString,getExample,setExampleInclude);
        this.registerExternalFile(this.resource.ownerApi.globalSchemas, name, 'schema', fileRole, body, getName,getSchema,setGlobalSchema);
    }

    private registerExternalFile(map:{[key:string]:ExternalFile}, name:string, fileType:string, fileRole:string, body:Body, fileMethod, bodyGetMethod, bodySetMethod) {
        var content=bodyGetMethod.call(body)
        if(!content){
            return
        }
        var file:ExternalFile
        Object.keys(map).forEach(x=>{
            if(!file) {
                var f = map[x]
                if (f.content.trim() == content.trim()) {
                    file = f
                }
            }
        })
        if(!file) {
            var actualName = name
            var i = 0
            while (map[actualName]) {
                actualName = name + '_' + ++i
            }
            var filePath = fileType + 's/' + actualName + fileRole + '-' + fileType + '.json';
            file = new ExternalFile(actualName, this.resource.uri, filePath, content)
            map[actualName] = file
        }
        bodySetMethod.call( body, fileMethod.call(file) )
    }

    serialize(shift:string,shiftsCount:number):string {
        var buf:string[] = []
        buf.push(indent(shift, shiftsCount) + this.httpType().toLowerCase() + ':')
        var queryParams:{[key:string]:IRawParam} = this.queryParams()
        var queryParamKeys = Object.keys(queryParams);
        var ind1 = indent(shift, shiftsCount + 1);
        if (queryParamKeys.length > 0) {
            buf.push(ind1 + 'queryParameters:')
            queryParamKeys.forEach(x=>buf.push(queryParams[x].serialize(shift, shiftsCount + 2)))
        }
        var bodySerialized = super.serialize(shift, shiftsCount + 1);
        if (bodySerialized.length > 0) {
            buf.push(bodySerialized)
        }
        var responseCodes:string[] = Object.keys(this.responses())
        if(responseCodes.length>0){
            buf.push( ind1 + 'responses:')
            responseCodes.forEach(x=>{
                buf.push( this.responses()[x].serialize(shift,shiftsCount+2))
            })
        }
        var result = buf.join('\n');
        return result
    }
}

export class RawMethod extends RawAbstractMethod{

    constructor(call:IMethodCall,resource:IRawResource){
        super(call.httpType(),call.url(),resource)
        this._calls.push(call)
    }

    private _calls:IMethodCall[] = []

    calls():IMethodCall[]{return this._calls }
}

export class RawCompositeMethod extends RawAbstractMethod{

    constructor(url:string,httpType:string,resource:IRawResource,parts?:IRawMethod[]){
        super(httpType,url,resource)
        if(parts){
            this.parts = parts
        }
    }

    parts:IRawMethod[] = []

    calls():IMethodCall[]{
        var result:IMethodCall[] = []
        this.parts.forEach( x => {result = result.concat(x.calls())})
        return result
    }
}

export interface IMethodCall{

    url():string

    httpType():string

    queryParams():{[key:string]:ParamUsecase}

    body():Body

    responseCode():string

    response():Body
}

export class MethodCall implements IMethodCall{
    constructor(entry:har.Entry){
        this.entry = entry
    }

    private entry:har.Entry

    url():string{ return refineUrl(this.entry.request.url) }

    httpType():string{ return this.entry.request.method }

    queryParams():{[key:string]:ParamUsecase}{
        var map:{[key:string]:ParamUsecase} = {}
        var qs = this.entry.request.queryString
        if(qs) {
            qs.forEach(x=> {
                var occ:IParamOccurence = x
                var uc:ParamUsecase = map[occ.name]
                if (!uc) {
                    uc = new ParamUsecase()
                    map[occ.name] = uc
                }
                uc.occurences.push(occ)
            })
        }
        return map
    }

    body():Body{
        return this.composeBody(this.entry.request.postData)
    }

    responseCode():string{
        return ''+this.entry.response.status
    }

    response():Body{
        return this.composeBody(this.entry.response.content)
    }

    private composeBody(data:har.PostData|har.Content):Body{
        if(!data) {
            return undefined
        }
        var mediaType = data.mimeType
        if(!mediaType) {
            return undefined
        }
        var dataText = data.text
        if(dataText.trim().length==0||dataText.trim()=='{}'){
            return new Body(mediaType,null,null)
        }
        try {
            var text = JSON.stringify(JSON.parse(dataText), null, 2)
        } catch (e){
            return new Body(mediaType,null,text);
        }
        var schema:string = generateSchema(text,mediaType)
        return new Body(mediaType,schema,text)
    }
}

export interface IParamOccurence{

    name:string

    value:string
}

export class ParamUsecase{

    occurences:IParamOccurence[] = []
}

export interface IRawParam extends IRamlElement{

    name():string

    ofType():string

    example(): string

    multivalue():boolean

    usecases():ParamUsecase[]

    addUsecase(uc:ParamUsecase)
}

export class RawParam implements IRawParam{

    constructor(name:string){
        this._name = name
    }

    private _name:string

    private _usecases:ParamUsecase[] = []

    private _multivalue:boolean = false

    usecases():ParamUsecase[]{return this._usecases}

    addUsecase(uc:ParamUsecase){
        this._usecases.push(uc)
        if(uc.occurences.length>1){
            this._multivalue = true
        }
    }

    name():string {return this._name}

    multivalue():boolean{return this._multivalue}

    ofType():string {
        if(this.usecases().length==0){
            return undefined
        }
        var result:string
l0:     for(var i = 0 ; i < this.usecases().length ; i++) {
            var uc:ParamUsecase = this.usecases()[i]
            for(var j = 0 ; j < uc.occurences.length ; j++ ) {
                var occ:IParamOccurence = uc.occurences[j]
                var _type = detectType(occ.value)
                if (result) {
                    if (result !== _type) {
                        result = 'string'
                    }
                    if (result == 'string') {
                        break l0
                    }
                }
                else {
                    result = _type
                }
            }
        }
        return result
    }

    example():string {
        if(this._usecases.length==0){
            return undefined
        }
        return this._usecases[0].occurences[0].value
    }

    serialize(shift:string, shiftsCount:number):string{
        var buf:string[] = []
        buf.push( indent(shift,shiftsCount) + this.name() + ':')
        var ind1 = indent(shift, shiftsCount + 1);
        if(this.multivalue()){
            buf.push( ind1 + 'multivalue: true')
        }
        if(this.ofType() && this.ofType() != 'string'){
            buf.push( ind1 + 'type: ' + this.ofType())
        }
        if(this.example()){
            buf.push( ind1 + 'example: ' + this.example())
        }
        var result = buf.join('\n');
        return result
    }
}

export class Body implements IRamlElement{

    constructor(mediaType:string,schema:string,example:string){
        this._mediaType = mediaType
        this._schema = schema
        this._example = example
    }

    _mediaType:string

    _schema:string

    _example:string

    globalSchema:string

    exampleInclude:string

    setGlobalSchema(gs:string){this.globalSchema = gs}

    setExampleInclude(ei:string){this.exampleInclude = ei}

    mediaType():string{ return this._mediaType }

    schema():string{ return this._schema }

    example():string{ return this._example }

    serialize(shift:string,shiftsCount:number):string {
        var buf:string[] = []
        buf.push(indent(shift, shiftsCount) + this.mediaType() + ':')
        var ind1 = indent(shift, shiftsCount + 1);
        if (this.schema() && this.schema().trim().length > 0) {
            buf.push(ind1 + 'schema: ' + this.globalSchema)
        }
        if (this.example() && this.example().trim().length > 0) {
            buf.push(ind1 + 'example: ' + this.exampleInclude)
        }
        var result:string = buf.join('\n')
        return result
    }
}

export class RawResponse extends BodyOwner{

    constructor(code:string){
        super()
        this._code = code
    }

    private _code:string

    code():string{return this._code}

    addBody(body:Body){
        if(!this._body){
            this._body = {}
        }
        var bodies:Body[] = this.body()[body.mediaType()]
        if(!bodies){
            bodies = []
            this.body()[body.mediaType()] = bodies
        }
        bodies.push(body)
    }

    serialize(shift:string,shiftsCount:number):string{
        var buf:string[] = []
        buf.push(indent(shift,shiftsCount) + this.code() + ':')
        var bodySerialized = super.serialize(shift, shiftsCount + 1);
        if (bodySerialized.length > 0) {
            buf.push(bodySerialized)
        }
        var result:string = buf.join('\n')
        return result
    }
}

export class ExternalFile{

    constructor(name:string, uri:string, filePath:string, content:string) {
        this._name = name;
        this.uri = uri;
        this.filePath = filePath;
        this.content = content;
    }

    _name:string

    uri:string

    filePath:string

    content:string

    name():string{return this._name}

    getIncludeString():string{ return '!include ' + this.filePath }
}

export class Har2Raml {

    bUri:string=""

    launch(logsPath:string,bUri:string):IRawApi{
        var harLogs:har.Log[] = []
        this.bUri=bUri;
        if(fs.lstatSync(logsPath).isDirectory()) {
            var files = fs.readdirSync(logsPath);
            files = files.filter(x=>stringEndsWith(x, 'har.json') || stringEndsWith(x, '.har'))
            files.forEach(x=>harLogs.push(JSON.parse(fs.readFileSync(path.resolve(logsPath, x)).toString())['log']))
        }
        else{
            if(path.extname(logsPath)==".har"){
                harLogs.push(JSON.parse(fs.readFileSync(logsPath).toString())['log']);
            }
        }
        var api:IRawApi = this.har2raml(harLogs);
        return api
    }

    har2raml(harLogs:har.Log[]):IRawApi {

        var entries:har.Entry[] = []
        harLogs.forEach(x => entries = entries.concat(x.entries))
        var calls:IMethodCall[] = entries.map(x => new MethodCall(x))
        var api:IRawApi = this.createRawApi(calls)
        var refinedApi:IRawApi = this.refineApi(api)
        return refinedApi
    }

    private createRawApi(calls:IMethodCall[]):IRawApi {

        var api:IRawApi = new RawApi('RAML API','')
        calls.forEach(call=>{

            var url:string = call.url()
            var res:IResourceOwner = api
            if (url.indexOf(this.bUri)==-1){
                return;
            }
            var protocol = this.extractProtocol(url);
            res = api.getOrCreateResource(protocol);
            url = url.substring(protocol.length);

            this.addToApi(call,res,url,api)
        })
        return api;
    }

    private addToApi(call:IMethodCall,resource:IResourceOwner,relUri:string,api:IRawApi){

        if(relUri.length==0 && (resource instanceof RawResource)){
            (<IRawResource>resource).addCall(call)
            return
        }

        var ind = relUri.indexOf('/')
        if(ind == 0){
            ind = relUri.indexOf('/',1)
        }
        if(ind<0){
            ind = relUri.length
        }
        var segment:string = relUri.substring(0,ind)
        var res:IRawResource = resource.getOrCreateResource(segment);
        var nextUri:string = relUri.substring(segment.length)
        this.addToApi(call,res,nextUri,api)
    }

    private extractProtocol(url:string):string{
        var ind:number = url.indexOf('://')
        if(ind<0){
            return null;
        }
        ind += '://'.length
        return url.substring(0,ind);
    }

    private refineApi(api:IRawApi):IRawApi{

        var baseUri:string = ''

        var res:IResourceOwner = api
        var keys:string[] = Object.keys(res.resources());
        while(keys.length == 1){
            var r1:IRawResource = res.resources()[keys[0]];
            baseUri += r1.segment()
            keys = Object.keys(r1.resources());
            res = r1
        }
        if(baseUri.length==0) {
            return api
        }
        var result:IRawApi = new RawApi('RAML API',baseUri)
        keys.forEach(key=>result.resources()[key] = res.resources()[key])
        result.setOwnerApi(result)
        return result
    }

    serialize(api:IRawApi,ramlPath:string){
        var rootDir:string
        if(path.extname(ramlPath)!='.raml' || (fs.existsSync(ramlPath)&&fs.lstatSync(ramlPath).isDirectory)){
            rootDir = ramlPath
            ramlPath = path.resolve(ramlPath,'api.raml')
        }
        else{
            rootDir = path.dirname(ramlPath)
        }

        if (!fs.existsSync(rootDir)) {
            mkdirp.sync(rootDir)
        }
        var ramlString:string = api.serialize('  ',0);
        fs.writeFileSync(ramlPath,ramlString)

        var examples:{[key:string]:ExternalFile} = api.globalExamples
        this.writeFiles(examples,rootDir)

        var schemas:{[key:string]:ExternalFile} = api.globalSchemas
        this.writeFiles(schemas,rootDir)
    }

    private writeFiles(map:{[key:string]:ExternalFile},rootDir:string) {
        if(!map){
            return
        }
        var keys:string[] = Object.keys(map)
        if(keys.length==0){
            return
        }
        keys.forEach(x=>{
            var file:ExternalFile = map[x]
            var filePath = file.filePath;
            if(filePath.indexOf('/')==0){
                filePath = filePath.substring(1)
            }
            var fileAbsPath = path.resolve(rootDir, filePath);
            var dir = path.dirname(fileAbsPath);
            if(!fs.existsSync(dir)) {
                mkdirp.sync(dir)
            }
            fs.writeFileSync(fileAbsPath,file.content)
        })
    }
}

function indent(shift:string,shiftsCount:number){
    var str = ''
    for(var i = 0 ; i < shiftsCount ; i++){
        str += shift
    }
    return str
}

function detectType(value:string):string{

    var num = parseFloat(value)
    if(!isNaN(num)) {
        return 'number'
    }
    if(value == 'true' || value == 'false'){
        return 'boolean'
    }
    return 'string'
}

export function generateSchema(text:string,mediaType:string):string{
    var generator = new schemaGenerator.JsonSchemaGenerator()
    var obj = JSON.parse(text);
    var schemaObject = generator.generateSchema(obj)
    var schemaString = JSON.stringify(schemaObject,null,2)
    return schemaString
}

export function launch(harLogsPath:string,baseUri):IRawApi{
    return new Har2Raml().launch(harLogsPath,baseUri)
}

export function serialize(api:IRawApi,ramlPath:string){
    new Har2Raml().serialize(api,ramlPath)
}

export function mergeResources(parent:IResourceOwner,newParent:IResourceOwner,resources:IRawResource[],segment:string):IRawResource{
    
    if(segment.indexOf('/')!=0){
        segment = '/' + segment
    }
    var parentUri = newParent.uri
    var ind = parentUri.length-1
    if(ind>=0){
        if(parentUri.charAt(ind)=='/'){
            parentUri = parentUri.substring(0,ind)
        }
    }
    var uri:string = parentUri + segment
    
    if(parent){
        resources.forEach(x=>delete parent.resources()[x.segment()])
    }
    var composite:RawCompositeResource = new RawCompositeResource(segment,uri,newParent.ownerApi,resources)
    newParent.resources()[segment] = composite
    
    var methodsMap:{[key:string]:IRawMethod[]} = {}
    resources.forEach(x=>x.methodsArray().forEach(y=>{
        var httpType:string = y.httpType()
        var arr:IRawMethod[] = methodsMap[httpType]
        if(!arr){
            arr = []
            methodsMap[httpType] = arr
        }
        arr.push(y)
    }))
    
    Object.keys(methodsMap).forEach(x=> composite.methods()[x] = new RawCompositeMethod(uri,x,composite,methodsMap[x]))
    
    var resourcesMap:{[key:string]:IRawResource[]} = {}
    resources.forEach(x=>x.resourcesArray().forEach(y=>{
        var sg:string = y.segment()
        var arr:IRawResource[] = resourcesMap[sg]
        if(!arr){
            arr = []
            resourcesMap[sg] = arr
        }
        arr.push(y)
    }))
    
    Object.keys(resourcesMap).forEach(x=>{

        var arr:IRawResource[] = resourcesMap[x]
        var merged:IRawResource = mergeResources(undefined,composite,arr,x)
        composite.resources()[x] = merged
    })
    return composite
}

function refineUrl(url) {
    var ind1 = Math.max(url.lastIndexOf('http://'), url.lastIndexOf('https://'))
    if (ind1 < 0) {
        ind1 = 0
    }

    var ind2:number = url.indexOf('?', ind1)
    if (ind2 < 0) {
        ind2 = url.length
    }
    url = url.substring(ind1, ind2)
    return url;
}

function stringEndsWith( str: string, search: string ): boolean {
    var dif:number = str.length - search.length;
    return dif>=0 && str.lastIndexOf(search) === dif;
}