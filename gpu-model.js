// Feature detection and fallback are separate from inference so unsupported GPUs
// never need to download or initialize an FP16 model.
export async function loadDepthModel({gpu,load,onNotice=()=>{}}){
 if(!gpu)throw Error('全画面重光照需要 WebGPU，请使用支持 WebGPU 的 Chrome 或 Edge。');
 const adapter=await gpu.requestAdapter();
 if(!adapter)throw Error('浏览器未找到可用的 WebGPU 设备，请检查硬件加速或显卡驱动。');
 const useFP16=adapter.features.has('shader-f16');
 if(!useFP16){
  onNotice('当前设备不支持 FP16，正在加载 FP32 兼容模型（约 100 MB）…');
  return {model:await load('fp32'),dtype:'fp32'};
 }
 try{return {model:await load('fp16'),dtype:'fp16'}}
 catch(error){
  onNotice('FP16 初始化失败，正在尝试 FP32 兼容模式…');
  try{return {model:await load('fp32'),dtype:'fp32'}}
  catch(fallbackError){throw Error('FP32 兼容模型启动失败：'+fallbackError.message,{cause:error})}
 }
}
