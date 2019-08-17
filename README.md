# stream-video-with-nodejs-koajs

## how to use
```
git clone
cd stream-video-with-nodejs-koajs
npm i
nodemon app.js
```

## explain

今天看了 Nodejs 文档的 Stream 部分, 因为常用的 http 和 fs 这两个模块的实例很多也是 stream 实例, 对加深了解 http 和 fs 有帮助.

看了这个模块之后我就想怎么用 nodejs 向浏览器传输视频, 就像我们在 youtube 看视频那样, 视频可以一边播放一边缓冲.

我首先想到这样:

```
const http = require('http');
const path = require('path');
const fs = require('fs');

http.createServer((req, res) => {
  const videoStream = fs.createReadStream(path.join(__dirname, 'video.mp4'));
  res.setHeader('Content-Type', 'video/mp4');
  videoStream.pipe(res);
}).listen(4000);
```

但这样浏览器并不会边播放边缓冲, 而是先把整个视频都缓冲下载下来之后再开始播放, 这明显不可取. 搜一下, 找到一篇解决这个问题的[文章](https://medium.com/better-programming/video-stream-with-node-js-and-html5-320b3191a6b6).

刚开始没看懂, 我以为问题的关键是 stream, 后来发现自己的思路跑偏了, 问题的关键其实是 http 协议, 关键是要设置合适的 header 和 status code.

现实情况是, 我们通常不会直接访问一个视频, 而是访问一个 html 页面, 这个页面通过 `<video />` 元素插入视频来源, 所以首先写一个简单的 html 吧:

```
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
</head>
<body>
  <p>stream video with nodejs and koajs</p>
  <video controls autoplay muted>
    <source src='http://localhost:4000/video' type='video/mp4'>
  </video>
</body>
</html>
```

然后写一个 node 服务器, 用 koa 或 express 提供路由, 当访问 http://localhost:4000 时打开上面这个 html 页面, 浏览器会根据 `<video />` 中的视频链接自动请求视频. [原作者的代码](https://github.com/daspinola/video-stream-sample)基于 express 框架, 我改成了 koa, 如下:

```
const fs = require('fs');
const Koa = require('koa')
const koaRouter = require('@koa/router');
const path = require('path');

const app = new Koa();
const router = new koaRouter();

router.get('/', (ctx, next) => {
  const fileStream = fs.createReadStream(path.join(__dirname, 'index.html'), {start: 0, end: 100});
  ctx.set('Content-Type', 'text/html');
  ctx.body = fileStream;
  next();
})

router.get('/video', (ctx, next) => {
  const videoPath = path.join(__dirname, 'video.mp4');
  const size = fs.statSync(videoPath).size;
  const range = ctx.request.header.range;

  if (range) {
    const positions = range.replace(/bytes=/, '').split('-');
    const start = parseInt(positions[0], 10);
    const end = positions[1] ? parseInt(positions[1], 10) : (size - 1);
    //注意 fs.createReadStream() 可以接收第二个参数
    const videoStream = fs.createReadStream(videoPath, { start, end });
    ctx.set('Content-Type', 'video/mp4');
    ctx.set('Content-Length', `${end - start + 1}`);
    ctx.set('Content-Range', `bytes ${start}-${end}/${size}`);
    ctx.set('Accept-Ranges', 'bytes');
    // 注意 status code 是 206
    ctx.status = 206;
    ctx.body = videoStream;
  } else {
    const videoStream = fs.createReadStream(videoPath);
    ctx.set('Content-Type', 'video/mp4');
    ctx.status = 200;
    ctx.body = videoStream;
    next();
  }
})


app.use(router.routes());

app.listen(4000)
```

浏览器看到 `<video>` 的链接后, 通常会自动发送带有 range header 的 request 请求, 例如 chrome 会发送 `range: bytes=0-`, 它的作用是让服务器发送所请求的数据中的一部分, 不要一下子全部发过来, 其中 0 表示从第 0 个字节开始发送, - 后面没有数字, 因为它不知道数据有多少个字节.

当然, 服务器可以忽略这个 header, 直接把整个视频传过去, 就像我开头写的那段代码, 我觉得这样不好, 所以我用 `if(range)` 看看 request 有没有这个 range, 如果有, 那我的 response 的 header 除了添加 `Content-Type`, 还添加了 `Content-Range`, `Content-Length`, `Accept-Ranges`, 其中 `Accept-Ranges` 用于告诉浏览器我支持 partial requests, `Content-Length` 告诉浏览器我这次发送的数据体积是多少, `Content-Range` 告诉浏览器这次发送的是视频的哪个部分. 还有一点很关键, 那就是把 status code 设置为 206, 206 代表 partial requests, 是一个成功响应 request 的 status code 之一.

整个传输流程大概是这样的: 浏览器访问 /, 得到 index.html, 从中看到 video 的链接, 自觉地请求这个 video, 还在 header 带上了 range, 服务器看到有 range, 但这个 range 只有起始字节, 没有结束字节, 所以把还是把整个视频都发给浏览器, 不过也告诉浏览器我支持 partial requests. 浏览器其实并没有接收所有数据, 而是接收了一部分, 然后暂时停止接收, 但它知道服务器支持 partial requests, 所以当需要时, 再发送带有 range 的请求, 但依然只有起始字节没有结束字节, 服务器不敢怠慢, 把起始到结束的所有字节全部发回, 浏览器依然只接收一部分...

注意 `Content-Range` 中的开始字节是从 0 开始计的, 就像数组, 第一个元素的 index 是 0. 顺便提一下, 原生 nodejs 用 `pipe()` 方法把 readable stream 传给 writable stream, 即 `videoStream.pipe(res)`, 但 koa 可以直接把 readable stream 赋值给 `ctx.body`.

