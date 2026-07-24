// Serverless platforms like Vercel don't reliably bundle swagger-ui-express's
// local static assets (swagger-ui-bundle.js etc.), so those 404 in production
// and the page renders blank. Loading Swagger UI from a CDN instead sidesteps
// that entirely -- same HTML works locally and on Vercel.
const SWAGGER_UI_VERSION = '5.32.8';
const CDN_BASE = `https://cdn.jsdelivr.net/npm/swagger-ui-dist@${SWAGGER_UI_VERSION}`;

const apiDocsPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Vaelora Backend API Docs</title>
  <link rel="stylesheet" href="${CDN_BASE}/swagger-ui.css">
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="${CDN_BASE}/swagger-ui-bundle.js"></script>
  <script src="${CDN_BASE}/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: '/api-docs.json',
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        layout: 'StandaloneLayout',
      });
    };
  </script>
</body>
</html>`;

module.exports = apiDocsPage;
