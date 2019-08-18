const fs = require('fs');
const Koa = require('koa')
const koaRouter = require('@koa/router');
const path = require('path');

const app = new Koa();
const router = new koaRouter();

router.get('/', (ctx, next) => {
  const fileStream = fs.createReadStream(path.join(__dirname, 'index.html'));
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
    const videoStream = fs.createReadStream(videoPath, { start, end });
    ctx.set('Content-Type', 'video/mp4');
    ctx.set('Content-Length', `${end - start + 1}`);
    ctx.set('Content-Range', `bytes ${start}-${end}/${size}`);
    ctx.set('Accept-Ranges', 'bytes');
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
const port = process.env.PORT || 8080;
app.listen(port, ()=>console.log(`server running on port: ${port}...`))
