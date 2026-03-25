from pydantic import BaseModel, Field, AliasChoices
from typing import List


class UserInfo(BaseModel):
    uuid: str


class AssayInfo(BaseModel):
    uuid: str
    name: str
    cohorts: List[str]
    datasets: List[str]


class MinioSystemInfo(BaseModel):
    base_url: str = Field(..., validation_alias=AliasChoices('base_url', 'public_path'))


class SystemInfo(BaseModel):
    minio: MinioSystemInfo


class ToolConfigRequest(BaseModel):
    user_info: UserInfo = Field(..., validation_alias=AliasChoices('user_info', 'user-info', 'userInfo'))
    assay_info: AssayInfo = Field(..., validation_alias=AliasChoices('assay_info', 'assay-info', 'assayInfo'))
    system: SystemInfo


class UserAuth(BaseModel):
    user_uuid: str
    assay_uuid: str
