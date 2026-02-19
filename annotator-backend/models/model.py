from pydantic import BaseModel
from typing import Union, List, Optional
from .api_models import UserAuth

# need to remove
class Masks(BaseModel):
    caseId: Union[int, str]
    masks: object

class MaskInitRequest(BaseModel):
    """Request model for initializing empty masks for a new case"""
    caseId: Union[int, str]
    layerId: str
    dimensions: List[int]  # [width, height, depth]
    voxelSpacing: Optional[List[float]] = None
    spaceOrigin: Optional[List[float]] = None


class Mask(BaseModel):
    caseId: Union[int, str]
    sliceId: int
    label: str
    mask: list


# Phase 0 - Data Persistence Strategy: New models for layer-based mask operations

class MaskDeltaChange(BaseModel):
    """Single voxel change in a mask layer"""
    x: int  # voxel X coordinate
    y: int  # voxel Y coordinate
    z: int  # voxel Z coordinate (slice index)
    value: int  # channel value (0-8, where 0 = transparent)


class MaskDeltaRequest(BaseModel):
    """Request model for incremental mask updates"""
    caseId: Union[int, str]
    layer: str  # 'layer1', 'layer2', or 'layer3'
    changes: List[MaskDeltaChange]


class MaskSliceUpdate(BaseModel):
    """Request model for updating a complete slice in a mask layer"""
    caseId: Union[int, str]
    layerId: str  # 'layer1', 'layer2', or 'layer3'
    channelId: int  # channel/label ID (0-8, where 0 = transparent)
    sliceIndex: int  # slice number
    axis: str  # 'x', 'y', 'z' or 'sagittal', 'coronal', 'axial'
    sliceData: List[int]  # flattened Uint8Array
    width: int
    height: int



class Sphere(BaseModel):
    caseId: str
    sliceId: int
    origin: list
    spacing: list
    sphereRadiusMM: int
    sphereOriginMM: list


class ReportPosition(BaseModel):
    x: Union[float, int, str]
    y: Union[float, int, str]
    z: Union[float, int, str]


class ReportPoint(BaseModel):
    position: ReportPosition
    distance: str
    start: str
    end: str
    duration: str


class ReportClockFace(BaseModel):
    face: str
    start: str
    end: str
    duration: str


class TumourStudyReport(BaseModel):
    case_name: str
    skin: ReportPoint
    ribcage: ReportPoint
    nipple: ReportPoint
    clock_face: ReportClockFace
    start: str
    end: str
    total_duration: str
    spacing: ReportPosition
    origin: ReportPosition
    complete: bool
    assisted: bool


class TumourPositionNNMask(BaseModel):
    caseId: str
    position: list


class TumourPosition(BaseModel):
    case_name: str
    position: ReportPosition
    validate: bool


class TumourAssisted(BaseModel):
    tumour_position: TumourPosition
    tumour_study_report: TumourStudyReport


class AssayWorkflowDetails(BaseModel):
    uuid: str
    seekId: str
    inputs: list
    outputs: list


class AssayDetails(BaseModel):
    uuid: str
    seekId: str
    workflow: AssayWorkflowDetails
    numberOfParticipants: int
    isAssayReadyToLaunch: bool
