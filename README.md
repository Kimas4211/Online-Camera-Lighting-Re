# Luma · 实时人脸补光

在浏览器内运行的摄像头补光实验。基于 MediaPipe 人脸三维关键点和 WebGL 表面法线补光；不模拟真实投射阴影。

## 使用

打开 GitHub Pages 地址，点击「开启摄像头」并授权。拖动光球，调整亮度、柔和度、距离和颜色。支持原图对比、镜像、人脸网格以及本地 PNG 导出。

视频和关键点只在浏览器内处理，不上传。摄像头只请求视频，不请求麦克风。点击关闭摄像头或离开页面会释放设备。

## 发布

仓库 Settings → Pages → Build and deployment → Source 选择 GitHub Actions。推送 main 后由 `.github/workflows/pages.yml` 自动发布。若仓库使用其他默认分支，应同步修改工作流分支。

## 本地运行

先运行 `python download-assets.py` 下载并校验固定版本的模型和运行库，然后在项目根目录运行 `python -m http.server 8000`，打开 http://localhost:8000 。摄像头需要 HTTPS 或 localhost，不能直接双击 HTML 使用。

## 文件

- `index.html` / `style.css`：界面。
- `app.js`：摄像头、交互、人脸追踪与 WebGL 补光。
- `download-assets.py` / `asset-checksums.json`：发布时下载并校验运行资源，随后所有资源从当前网站同源加载。浏览器不依赖外部 CDN。

MediaPipe 项目：https://github.com/google-ai-edge/mediapipe 。依赖的第三方许可见 `THIRD_PARTY_NOTICES.md`。

## 验证范围

JavaScript 语法、界面引用和模型文件完整性已检查；实际摄像头、WebGL 视觉表现及设备性能仍需在目标浏览器实测。
