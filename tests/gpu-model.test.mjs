import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadDepthModel} from '../gpu-model.js';
const gpu=supported=>({requestAdapter:async()=>({features:new Set(supported?['shader-f16']:[])})});
test('GPU without FP16 requests only FP32 and reports compatibility mode',async()=>{
 const calls=[],notices=[];
 const result=await loadDepthModel({gpu:gpu(false),load:async dtype=>{calls.push(dtype);return {dtype}},onNotice:m=>notices.push(m)});
 assert.deepEqual(calls,['fp32']);assert.equal(result.dtype,'fp32');assert.match(notices[0],/FP32/);
});
test('GPU with FP16 uses the smaller model',async()=>{
 const calls=[];const result=await loadDepthModel({gpu:gpu(true),load:async dtype=>{calls.push(dtype);return {}}});
 assert.deepEqual(calls,['fp16']);assert.equal(result.dtype,'fp16');
});
test('FP16 initialization failure recovers through FP32',async()=>{
 const calls=[];const result=await loadDepthModel({gpu:gpu(true),load:async dtype=>{calls.push(dtype);if(dtype==='fp16')throw Error('FP16 unsupported by runtime');return {}}});
 assert.deepEqual(calls,['fp16','fp32']);assert.equal(result.dtype,'fp32');
});
test('No adapter produces a clear error without model download',async()=>{
 let loaded=false;await assert.rejects(loadDepthModel({gpu:{requestAdapter:async()=>null},load:async()=>{loaded=true}}),/WebGPU/);assert.equal(loaded,false);
});
test('Both model failures surface the compatibility error',async()=>{
 await assert.rejects(loadDepthModel({gpu:gpu(true),load:async dtype=>{throw Error(dtype+' failed')}}),/FP32.*fp32 failed/);
});
