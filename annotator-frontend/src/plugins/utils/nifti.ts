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
    const blob = await useSingleFile(niiPath, true);

    if (!blob || !(blob instanceof Blob)) {
      console.warn(`NIfTI file not found or invalid: ${niiPath}`);
      return null;
    }

    // Step 2: Convert Blob to ArrayBuffer
    const arrayBuffer = await blobToArrayBuffer(blob);

    // Step 3: Check if compressed and decompress if needed
    let niftiBuffer = arrayBuffer;
    if (nifti.isCompressed(arrayBuffer)) {
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
 * Convert a raw NIfTI image ArrayBuffer to a Uint8Array of voxel values,
 * correctly interpreting the stored datatype.
 */
function niftiTypedArrayToUint8(imageData: ArrayBuffer, dtCode: number, pathForLog: string): Uint8Array {
  const clamp = (v: number) => v < 0 ? 0 : v > 255 ? 255 : v;
  switch (dtCode) {
    case nifti.NIFTI1.TYPE_UINT8: {
      return new Uint8Array(imageData);
    }
    case nifti.NIFTI1.TYPE_INT8: {
      const src = new Int8Array(imageData);
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = clamp(src[i]);
      return out;
    }
    case nifti.NIFTI1.TYPE_UINT16: {
      const src = new Uint16Array(imageData);
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = src[i] > 255 ? 255 : src[i];
      return out;
    }
    case nifti.NIFTI1.TYPE_INT16: {
      const src = new Int16Array(imageData);
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = clamp(src[i]);
      return out;
    }
    case nifti.NIFTI1.TYPE_UINT32: {
      const src = new Uint32Array(imageData);
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = src[i] > 255 ? 255 : src[i];
      return out;
    }
    case nifti.NIFTI1.TYPE_INT32: {
      const src = new Int32Array(imageData);
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = clamp(src[i]);
      return out;
    }
    case nifti.NIFTI1.TYPE_FLOAT32: {
      const src = new Float32Array(imageData);
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = clamp(Math.round(src[i]));
      return out;
    }
    case nifti.NIFTI1.TYPE_FLOAT64: {
      const src = new Float64Array(imageData);
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = clamp(Math.round(src[i]));
      return out;
    }
    case nifti.NIFTI1.TYPE_INT64: {
      // BigInt64Array — extract low 32 bits and clamp
      const src = new BigInt64Array(imageData);
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) {
        const v = Number(src[i]);
        out[i] = clamp(v);
      }
      return out;
    }
    case nifti.NIFTI1.TYPE_UINT64: {
      const src = new BigUint64Array(imageData);
      const out = new Uint8Array(src.length);
      for (let i = 0; i < src.length; i++) {
        const v = Number(src[i]);
        out[i] = v > 255 ? 255 : v;
      }
      return out;
    }
    default: {
      console.warn(`useNiftiVoxelData: unhandled datatypeCode ${dtCode} for ${pathForLog}, falling back to raw bytes`);
      return new Uint8Array(imageData);
    }
  }
}

/**
 * Read NIfTI file and return only the raw voxel data as Uint8Array.
 *
 * Handles fetching, decompression, header parsing, and voxel extraction
 * so that callers receive a flat byte array ready to copy into a MaskVolume.
 *
 * @param niiPath - Path to the .nii or .nii.gz file on backend
 * @returns Promise<Uint8Array | null> - Raw voxel bytes, or null if failed
 */
export async function useNiftiVoxelData(niiPath: string): Promise<Uint8Array | null> {
  const buffer = await useNiftiReader(niiPath);
  if (!buffer) return null;

  const header = nifti.readHeader(buffer);
  if (!header) {
    console.error(`Failed to read NIfTI header: ${niiPath}`);
    return null;
  }

  // === DEBUG: Log NIfTI header info for diagnosis ===
  const h = header as nifti.NIFTI1Header | nifti.NIFTI2Header;
  console.log(`[NIfTI DEBUG] File: ${niiPath}`);
  console.log(`[NIfTI DEBUG] dims: [${h.dims}]`);
  console.log(`[NIfTI DEBUG] shape: ${h.dims[1]} x ${h.dims[2]} x ${h.dims[3]}`);
  console.log(`[NIfTI DEBUG] total voxels: ${h.dims[1] * h.dims[2] * h.dims[3]}`);
  console.log(`[NIfTI DEBUG] datatypeCode: ${h.datatypeCode}`);
  console.log(`[NIfTI DEBUG] numBitsPerVoxel: ${h.numBitsPerVoxel}`);
  console.log(`[NIfTI DEBUG] pixDims: [${h.pixDims}]`);
  console.log(`[NIfTI DEBUG] qform_code: ${h.qform_code}, sform_code: ${h.sform_code}`);
  // === END DEBUG ===

  const imageData = nifti.readImage(header, buffer);
  if (!imageData) {
    console.error(`Failed to read NIfTI image data: ${niiPath}`);
    return null;
  }

  // Convert to Uint8Array based on the actual NIfTI datatype.
  // Simply doing `new Uint8Array(imageData)` reinterprets raw bytes and
  // produces wrong results for multi-byte types (e.g. int16 from AI models).
  const dtCode = h.datatypeCode;

  const result = niftiTypedArrayToUint8(imageData, dtCode, niiPath);
  console.log(`[NIfTI DEBUG] imageData byteLength: ${imageData.byteLength}`);
  console.log(`[NIfTI DEBUG] result Uint8Array length: ${result.length}`);
  // Count non-zero values
  let nonZero = 0;
  for (let i = 0; i < result.length; i++) { if (result[i] !== 0) nonZero++; }
  console.log(`[NIfTI DEBUG] non-zero voxels: ${nonZero}`);
  return result;
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
