import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

const IMAGES_DIR = 'transaction_images';

/**
 * Get the directory path for storing transaction images
 */
function getImagesDirectory(): string {
  if (Platform.OS === 'web') {
    return 'transaction_images';
  }
  return `${Paths.document}/${IMAGES_DIR}`;
}

/**
 * Ensure the images directory exists
 */
async function ensureImagesDirectory(): Promise<void> {
  if (Platform.OS === 'web') {
    // Web uses IndexedDB/File storage differently, no directory creation needed
    return;
  }

  try {
    const tempFile = new File(Paths.document, `${IMAGES_DIR}/.gitkeep`);
    tempFile.write(new Uint8Array(0));
  } catch (error) {
    console.error('Error creating images directory:', error);
  }
}

/**
 * Generate a unique filename for an image
 */
function generateImageFilename(originalUri: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = originalUri.split('.').pop()?.toLowerCase() || 'jpg';
  return `${timestamp}_${random}.${extension}`;
}

/**
 * Save an image from a URI to app's document directory
 * Returns the relative path to the saved image (or base64 data URI for web)
 */
export async function saveImage(uri: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      // For web, convert to base64 data URI and return it directly
      // We store the full data URI in the database so it persists in IndexedDB
      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();

      return new Promise((resolve, reject) => {
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          resolve(base64); // Return the full data URI
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }

    await ensureImagesDirectory();

    const filename = generateImageFilename(uri);
    const relativePath = `${IMAGES_DIR}/${filename}`;

    // Native: Copy file to app's document directory
    // Read source file
    const sourceFile = new File(uri);
    const bytes = await sourceFile.bytes();

    // Write to destination
    const destFile = new File(Paths.document, relativePath);
    await destFile.write(bytes);

    return relativePath;
  } catch (error) {
    console.error('Error saving image:', error);
    return null;
  }
}

/**
 * Delete an image file
 */
export async function deleteImage(relativePath: string | null): Promise<void> {
  if (!relativePath) return;

  try {
    if (Platform.OS === 'web') {
      // For web, images are stored as base64 in the database
      // Nothing to delete from filesystem
      return;
    }

    const file = new File(Paths.document, relativePath);
    if (file.exists) {
      file.delete();
    }
  } catch (error) {
    console.error('Error deleting image:', error);
  }
}

/**
 * Get the full URI for displaying an image
 * For native: returns the file:// path
 * For web: returns the base64 data URI (pathIs already the full data URI)
 */
export function getImageUri(imagePath: string | null): string | null {
  if (!imagePath) return null;

  if (Platform.OS === 'web') {
    // For web, imagePath is already the base64 data URI
    return imagePath;
  }

  // For native, construct the file:// path
  return `file://${Paths.document}/${imagePath}`;
}

/**
 * Check if an image path exists (for native platforms)
 */
export async function imageExists(relativePath: string | null): Promise<boolean> {
  if (!relativePath) return false;

  if (Platform.OS === 'web') {
    return true; // For web, existence is tied to database
  }

  try {
    const file = new File(Paths.document, relativePath);
    return file.exists;
  } catch {
    return false;
  }
}

/**
 * Copy an image file to the app's document directory
 * Used when importing from backup
 */
export async function copyImageToStorage(
  imageData: Uint8Array,
  filename: string
): Promise<string> {
  await ensureImagesDirectory();

  const relativePath = `${IMAGES_DIR}/${filename}`;

  if (Platform.OS === 'web') {
    // For web, this would need different handling
    throw new Error('Web platform does not support binary image storage');
  }

  const destFile = new File(Paths.document, relativePath);
  await destFile.write(imageData);

  return relativePath;
}