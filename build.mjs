import {build} from 'esbuild';
import {mkdir,copyFile,readdir,readFile,writeFile} from 'node:fs/promises';
await mkdir('site/assets/ort',{recursive:true});
for(const f of ['index.html','style.css','app.js'])await copyFile(f,'site/'+f);
await build({entryPoints:['depth-worker.js'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'site/depth-worker.bundle.js',minify:true});
for(const f of await readdir('node_modules/onnxruntime-web/dist'))if(/ort-wasm.*\.(wasm|mjs)$/.test(f))await copyFile('node_modules/onnxruntime-web/dist/'+f,'site/assets/ort/'+f);
const revision='4472b7362082ad9968fee890ca0f1e5aca36b93d';
const model='site/assets/models/depth-anything';await mkdir(model+'/onnx',{recursive:true});
for(const file of ['config.json','preprocessor_config.json','onnx/model_fp16.onnx']){
 console.log('Downloading pinned model',file);let response=await fetch(`https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/${revision}/${file}`);if(!response.ok)throw Error('Model download '+response.status);
 await writeFile(model+'/'+file,new Uint8Array(await response.arrayBuffer()));
}
await copyFile('THIRD_PARTY_NOTICES.md','site/THIRD_PARTY_NOTICES.md');
await copyFile('node_modules/@huggingface/transformers/LICENSE','site/assets/TRANSFORMERS-LICENSE.txt');
await copyFile('node_modules/onnxruntime-web/README.md','site/assets/ONNX-RUNTIME-README.md');
console.log('Site built with same-origin model and runtime');
