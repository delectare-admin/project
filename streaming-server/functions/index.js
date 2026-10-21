'use strict';
const {initializeApp}=require('firebase-admin/app'),{getFirestore,FieldValue}=require('firebase-admin/firestore'),{getStorage}=require('firebase-admin/storage');
const {onObjectFinalized,onObjectMetadataUpdated,onObjectDeleted}=require('firebase-functions/v2/storage');
const {onDocumentCreated}=require('firebase-functions/v2/firestore'),{onSchedule}=require('firebase-functions/v2/scheduler'),logger=require('firebase-functions/logger');
const {safeRuntime}=require('./media-plan.cjs'),{createService,BUCKET}=require('./service.cjs');
initializeApp();let service;
function guarded(fn){return async event=>{
 if(!safeRuntime(process.version)){logger.warn('streaming_runtime_patch_required');return;}
 service??=createService({db:getFirestore(),storage:getStorage(),FieldValue,logger});return fn(service,event);
};}
const options={region:'us-east1',maxInstances:1,minInstances:0,concurrency:1,timeoutSeconds:540,memory:'4GiB',cpu:2,retry:false};
exports.submovieStreamCatalogCreate=onObjectFinalized({...options,bucket:BUCKET,memory:'512MiB',cpu:1},guarded((s,e)=>s.syncSource(e.data.name)));
exports.submovieStreamCatalogUpdate=onObjectMetadataUpdated({...options,bucket:BUCKET,memory:'512MiB',cpu:1},guarded((s,e)=>s.syncSource(e.data.name)));
exports.submovieStreamCatalogDelete=onObjectDeleted({...options,bucket:BUCKET,memory:'512MiB',cpu:1},guarded((s,e)=>s.deleted(e.data.name,e.data.generation)));
exports.submovieAdaptiveStream=onDocumentCreated({...options,document:'streamingJobs/{jobId}'},guarded((s,e)=>s.processJob(e.params.jobId)));
exports.submovieStreamMaintenance=onSchedule({...options,schedule:'every 30 minutes',timeZone:'Etc/UTC'},guarded(s=>s.maintenance()));
