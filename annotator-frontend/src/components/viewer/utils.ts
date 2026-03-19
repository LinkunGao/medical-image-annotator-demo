/**
 * Viewer Utility Functions
 *
 * @description Shared utility functions for the viewer components:
 * - Loading animation control
 * - NRRD mesh naming
 * - Coordinate transformations
 *
 * @module components/viewer/utils
 */
import * as Copper from "@/ts/index";

/** Type for tumour center position in mm */
type TTumourCenter = { x: number; y: number; z: number };

/**
 * Toggles the loading animation visibility.
 *
 * @param loadingContainer - The loading animation container element
 * @param progress - The progress text element
 * @param status - Display status: "flex" to show, "none" to hide
 * @param text - Optional text to display in progress element
 */
export const switchAnimationStatus = (
    loadingContainer: HTMLDivElement,
    progress: HTMLDivElement,
    status: "flex" | "none",
    text?: string
) => {
    loadingContainer!.style.display = status;
    !!text && (progress!.innerText = text);
};

/**
 * Assigns orientation names to loaded NRRD mesh objects.
 * Adds " sagittal", " coronal", " axial" suffixes to mesh names.
 *
 * @param nrrdMesh - The loaded NRRD mesh object containing x, y, z meshes
 * @param name - Base name to prepend to orientation suffix
 */
export function addNameToLoadedMeshes(
    nrrdMesh: Copper.nrrdMeshesType,
    name: string
) {
    nrrdMesh.x.name = name + " sagittal";
    nrrdMesh.y.name = name + " coronal";
    nrrdMesh.z.name = name + " axial";
}

/**
 * Sets tumour study point position with coordinate conversion.
 *
 * Converts mm coordinates to pixel coordinates for display.
 * Formula: pixel = mm * spacing
 *
 * @param nrrdTools - The NrrdTools instance
 * @param point - Tumour center position in mm
 * @param status - Type of marker: "tumour" | "nipple" | "skin" | "ribcage"
 */
export const setTumourStudyPointPosition = (
    nrrdTools: Copper.NrrdTools,
    point: TTumourCenter,
    status: "tumour" | "nipple" | "skin" | "ribcage") => {
    const spacing = nrrdTools.getVoxelSpacing()
    // Note: the tumour center we recieve is in mm, we need to convert it to (pixel, pixel, mm) in Axial view
    // pixel / spacing = mm
    // mm * spacing = pixel
    nrrdTools.setCalculateDistanceSphere(point.x * spacing[0], point.y * spacing[1], point.z, status);
}
