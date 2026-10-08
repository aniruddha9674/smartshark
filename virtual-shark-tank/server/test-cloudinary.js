import cloudinary from './src/config/cloudinary.js';

// A tiny sample image (1x1 red pixel) as a base64 data URI
const sampleImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

console.log('Testing Cloudinary upload...');

cloudinary.uploader.upload(sampleImage, { folder: 'test' })
  .then((result) => {
    console.log('✅ Upload SUCCESS!');
    console.log('Secure URL:', result.secure_url);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Upload FAILED:', error.message);
    process.exit(1);
  });