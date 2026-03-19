import * as Copper from "@/ts/index";
import { ILoadedMeshes } from "./segmentation";

export interface ILeftCoreCopperInit {
    appRenderer: Copper.copperRenderer;
    nrrdTools: Copper.NrrdTools;
    scene: Copper.copperScene
}

export interface IToolSphereData {
    sphereOrigin: number[];
    sphereRadius: number;
}

export interface IToolMaskData {
    sliceData: Uint8Array;
    layerId: string;
    channelId: number;
    sliceIndex: number;
    axis: "x" | "y" | "z";
    width: number;
    height: number;
    clearFlag?: boolean;
}

export interface IToolCalculateSpherePositionsData {
    tumourSphereOrigin: Copper.ICommXYZ | null;
    skinSphereOrigin: Copper.ICommXYZ | null;
    ribSphereOrigin: Copper.ICommXYZ | null;
    nippleSphereOrigin: Copper.ICommXYZ | null;
    aix: "x" | "y" | "z";
}

export interface IToolAfterLoadImagesResponse {
    allSlices: any[];
    allLoadedMeshes: ILoadedMeshes[];
}

export interface IToolGetMouseDragContrastMove {
    step: number,
    towards: "horizental" | "vertical"
}
