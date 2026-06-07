import express from 'express';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get('/', (_req, res) => {
  res.json({ ok: true, project: '{{PROJECT_NAME}}' });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`{{PROJECT_NAME}} listening on http://127.0.0.1:${port}`);
});
