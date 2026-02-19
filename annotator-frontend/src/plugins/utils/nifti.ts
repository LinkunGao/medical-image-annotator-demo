/**
 * NIfTI file utilities for reading and processing medical image data
 *
 * @module utils/nifti
 */

import * as nifti from 'nifti-reader-js';
import { useSingleFile } from '../api/cases';

/**
 * Read NIfTI file from backend and return decompressed ArrayBuffer
 *
 * @param niiPath - Path to the .nii or .nii.gz file on backend
 * @returns Promise<ArrayBuffer | null> - Decompressed NIfTI data buffer, or null if failed
 *
 * @example
 * ```typescript
 * const buffer = await useNiftiReader('/path/to/mask_layer1.nii.gz');
 * if (buffer) {
 *   const header = nifti.readHeader(buffer);
 *   const imageData = nifti.readImage(header, buffer);
 * }
 * ```
 */
export async function useNiftiReader(niiPath: string): Promise<ArrayBuffer | null> {
  try {
    // Step 1: Fetch the file from backend as Blob
    const blob = await useSingleFile(niiPath);

    if (!blob || blob === 404) {
      console.warn(`NIfTI file not found: ${niiPath}`);
      return null;
    }

    // Step 2: Convert Blob to ArrayBuffer
    const arrayBuffer = await blobToArrayBuffer(blob);

    // Step 3: Check if compressed and decompress if needed
    let niftiBuffer = arrayBuffer;
    if (nifti.isCompressed(arrayBuffer)) {
      console.log(`Decompressing NIfTI file: ${niiPath}`);
      niftiBuffer = nifti.decompress(arrayBuffer);
    }

    // Step 4: Validate that it's a valid NIfTI file
    if (!nifti.isNIFTI(niftiBuffer)) {
      console.error(`Invalid NIfTI file: ${niiPath}`);
      return null;
    }

    return niftiBuffer;
  } catch (error) {
    console.error(`Error reading NIfTI file ${niiPath}:`, error);
    return null;
  }
}

/**
 * Read NIfTI header information from a file path
 *
 * @param niiPath - Path to the .nii or .nii.gz file on backend
 * @returns Promise<nifti.NIFTI1Header | nifti.NIFTI2Header | null>
 *
 * @example
 * ```typescript
 * const header = await useNiftiHeader('/path/to/mask_layer1.nii.gz');
 * if (header) {
 *   console.log('Dimensions:', header.dims);
 *   console.log('Voxel spacing:', header.pixDims);
 * }
 * ```
 */
export async function useNiftiHeader(niiPath: string): Promise<nifti.NIFTI1Header | nifti.NIFTI2Header | null> {
  const buffer = await useNiftiReader(niiPath);
  if (!buffer) return null;

  return nifti.readHeader(buffer);
}

/**
 * Read NIfTI image data (voxel values) from a file path
 *
 * @param niiPath - Path to the .nii or .nii.gz file on backend
 * @returns Promise<ArrayBuffer | null> - Raw voxel data buffer
 *
 * @example
 * ```typescript
 * const imageData = await useNiftiImageData('/path/to/mask_layer1.nii.gz');
 * if (imageData) {
 *   // Process voxel data (e.g., convert to Uint8Array)
 *   const voxels = new Uint8Array(imageData);
 * }
 * ```
 */
export async function useNiftiImageData(niiPath: string): Promise<ArrayBuffer | null> {
  const buffer = await useNiftiReader(niiPath);
  if (!buffer) return null;

  const header = nifti.readHeader(buffer);
  if (!header) return null;

  return nifti.readImage(header, buffer);
}

/**
 * Convert Blob to ArrayBuffer
 *
 * @param blob - Blob to convert
 * @returns Promise<ArrayBuffer>
 */
async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert Blob to ArrayBuffer'));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
