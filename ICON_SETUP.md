# App Icon Setup

To add a custom icon to your Electron app:

## macOS (.icns file)

1. Create or obtain a 1024x1024 PNG image of your logo
2. Convert it to .icns format:
   ```bash
   # Install iconutil (comes with macOS)
   # Create an iconset directory
   mkdir icon.iconset
   
   # Create different sizes (required for macOS)
   sips -z 16 16     your-logo.png --out icon.iconset/icon_16x16.png
   sips -z 32 32     your-logo.png --out icon.iconset/icon_16x16@2x.png
   sips -z 32 32     your-logo.png --out icon.iconset/icon_32x32.png
   sips -z 64 64     your-logo.png --out icon.iconset/icon_32x32@2x.png
   sips -z 128 128   your-logo.png --out icon.iconset/icon_128x128.png
   sips -z 256 256   your-logo.png --out icon.iconset/icon_128x128@2x.png
   sips -z 256 256   your-logo.png --out icon.iconset/icon_256x256.png
   sips -z 512 512   your-logo.png --out icon.iconset/icon_256x256@2x.png
   sips -z 512 512   your-logo.png --out icon.iconset/icon_512x512.png
   sips -z 1024 1024 your-logo.png --out icon.iconset/icon_512x512@2x.png
   
   # Convert to .icns
   iconutil -c icns icon.iconset
   ```

3. Place `icon.icns` in the project root
4. Update package.json script to include: `--icon=icon.icns`

## Windows (.ico file)

1. Create or obtain a 256x256 PNG image
2. Convert to .ico (use online converter or ImageMagick)
3. Place `icon.ico` in the project root
4. Update package.json script to include: `--icon=icon.ico`

## Quick Setup

For now, the app will use the default Electron icon. To add your custom icon later:

1. Add your icon files to the project root
2. Update the package scripts in package.json to include `--icon=icon.icns` (macOS) or `--icon=icon.ico` (Windows)


