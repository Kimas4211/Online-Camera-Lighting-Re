import {AutoModelForDepthEstimation,AutoProcessor,RawImage,env} from '@huggingface/transformers';
const root=new URL('./',self.location.href).href;
env.allowRemoteModels=false;env.allowLocalModels=true;env.localModelPath=root+'assets/models/';
env.backends.onnx.wasm.wasmPaths=root+'assets/ort/';env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
let model,processor,offscreen,ctx;
self.onmessage=async({data:m})=>{
 let inputs,result;
 try{
  if(m.type==='init'){
   if(!navigator.gpu)throw Error('全画面重光照需要 WebGPU，请使用支持 WebGPU 的 Chrome 或 Edge。');
   processor=await AutoProcessor.from_pretrained('depth-anything');
   model=await AutoModelForDepthEstimation.from_pretrained('depth-anything',{device:'webgpu',dtype:'fp16',progress_callback:p=>{if(p.status==='progress')self.postMessage({type:'progress',value:Math.round(p.progress||0)})}});
   self.postMessage({type:'ready'});return;
  }
  if(m.type!=='frame')return;
  const started=performance.now();
  const h=Math.max(112,Math.round((196*m.height/m.width)/14)*14);
  processor.image_processor.size={width:196,height:h};
  if(processor.image_processor.config)processor.image_processor.config.size={width:196,height:h};
  offscreen??=new OffscreenCanvas(1,1);offscreen.width=m.width;offscreen.height=m.height;
  ctx??=offscreen.getContext('2d',{willReadFrequently:true});ctx.drawImage(m.bitmap,0,0);m.bitmap.close();
  inputs=await processor(RawImage.fromCanvas(offscreen));result=await model(inputs);
  const depth=result.predicted_depth;const values=depth.data;
  // Percentile normalization is less sensitive to single noisy extrema.
  const sorted=Float32Array.from(values).sort();const lo=sorted[Math.floor(sorted.length*.02)],hi=sorted[Math.floor(sorted.length*.98)];
  const pixels=new Float32Array(values.length);for(let i=0;i<values.length;i++)pixels[i]=Math.max(0,Math.min(1,(values[i]-lo)/Math.max(hi-lo,.0001)));
  self.postMessage({type:'depth',pixels,width:depth.dims.at(-1),height:depth.dims.at(-2),ms:performance.now()-started,epoch:m.epoch},[pixels.buffer]);
 }catch(e){m.bitmap?.close?.();self.postMessage({type:'error',message:e.message,epoch:m.epoch});}
 finally{for(const obj of [inputs,result])if(obj)for(const t of Object.values(obj))t?.dispose?.();}
};
