"""Download pinned runtime assets before serving; no camera data leaves the browser."""
from pathlib import Path
from urllib.request import urlopen
import hashlib,json
root=Path(__file__).resolve().parent
checks=json.loads((root/'asset-checksums.json').read_text())
base='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/'
for name,expected in checks.items():
    target=root/name
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest()==expected:
        continue
    if name=='assets/face.task':
        url='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
    elif name=='assets/vision.mjs':
        url=base+'vision_bundle.mjs'
    elif name=='assets/MEDIAPIPE-LICENSE.txt':
        url='https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/LICENSE'
    else:
        url=base+name.removeprefix('assets/')
    with urlopen(url,timeout=90) as response:
        data=response.read()
    if hashlib.sha256(data).hexdigest()!=expected:
        raise RuntimeError('Asset checksum mismatch: '+name)
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(data)
    print('Verified',name)
