const fs = require('fs');

try {
  const imageBuffer = fs.readFileSync('public/logo.png');
  const base64Image = imageBuffer.toString('base64');
  const svgContent = `
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="roundedCorner">
      <rect width="256" height="256" rx="48" ry="48" />
    </clipPath>
  </defs>
  <image href="data:image/png;base64,${base64Image}" width="256" height="256" clip-path="url(#roundedCorner)" preserveAspectRatio="xMidYMid slice" />
</svg>
`;

  fs.writeFileSync('src/app/icon.svg', svgContent.trim());
  if (fs.existsSync('src/app/icon.png')) {
    fs.unlinkSync('src/app/icon.png');
  }
  console.log("Successfully created src/app/icon.svg");
} catch (e) {
  console.error("Error formatting icon:", e);
}
