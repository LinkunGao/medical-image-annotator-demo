import os
from sqlalchemy import create_engine, Column, Integer, String, Boolean, ForeignKey, JSON
from sqlalchemy.orm import sessionmaker, relationship, declarative_base

DATABASE_PATH = os.getenv("DATABASE_PATH", "./annotator.db")
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# Create engine and session factory
engine = create_engine(DATABASE_URL, connect_args={'check_same_thread': False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String, unique=True, index=True, nullable=False)

    assays = relationship("Assay", back_populates="user")
    cases = relationship("Case", back_populates="user")

class Assay(Base):
    __tablename__ = 'assays'

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String, unique=True, index=True, nullable=False)
    user_uuid = Column(String, ForeignKey('users.uuid'), nullable=False)
    name = Column(String, nullable=False)
    minio_base_url = Column(String, nullable=False)
    datasets_config = Column(JSON, nullable=False)  # Stores list of dataset names
    cohorts_config = Column(JSON, nullable=False)   # Stores list of cohort/case names
    output_path = Column(String, nullable=False)
    output_sds_path = Column(String, nullable=False)

    user = relationship("User", back_populates="assays")
    cases = relationship("Case", back_populates="assay")

class Case(Base):
    __tablename__ = 'cases'

    id = Column(Integer, primary_key=True, index=True)
    user_uuid = Column(String, ForeignKey('users.uuid'), nullable=False) 
    assay_uuid = Column(String, ForeignKey('assays.uuid'), nullable=False)
    name = Column(String, nullable=False)
    is_current = Column(Boolean, default=False)

    user = relationship("User", back_populates="cases")
    assay = relationship("Assay", back_populates="cases")
    input = relationship("CaseInput", uselist=False, back_populates="case")
    output = relationship("CaseOutput", uselist=False, back_populates="case")

class CaseInput(Base):
    __tablename__ = 'case_inputs'

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey('cases.id'), unique=True, nullable=False)
    
    contrast_pre_path = Column(String, nullable=True)
    contrast_1_path = Column(String, nullable=True)
    contrast_2_path = Column(String, nullable=True)
    contrast_3_path = Column(String, nullable=True)
    contrast_4_path = Column(String, nullable=True)
    registration_pre_path = Column(String, nullable=True)
    registration_1_path = Column(String, nullable=True)
    registration_2_path = Column(String, nullable=True)
    registration_3_path = Column(String, nullable=True)
    registration_4_path = Column(String, nullable=True)

    case = relationship("Case", back_populates="input")

class CaseOutput(Base):
    __tablename__ = 'case_outputs'

    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey('cases.id'), unique=True, nullable=False)
    
    # Legacy JSON mask storage (kept for backward compatibility)
    # Config.OUTPUTS[0]: "mask_meta_json"
    mask_meta_json_path = Column(String, nullable=True)
    mask_meta_json_size = Column(Integer, nullable=True)
    
    # Layer-specific NIfTI mask storage (Phase 0 - Data Persistence Strategy)
    # Config.OUTPUTS[1-4]: "mask_layer1_nii", "mask_layer2_nii", "mask_layer3_nii", "mask_layer4_nii"
    mask_layer1_nii_path = Column(String, nullable=True)
    mask_layer1_nii_size = Column(Integer, nullable=True)
    mask_layer2_nii_path = Column(String, nullable=True)
    mask_layer2_nii_size = Column(Integer, nullable=True)
    mask_layer3_nii_path = Column(String, nullable=True)
    mask_layer3_nii_size = Column(Integer, nullable=True)
    mask_layer4_nii_path = Column(String, nullable=True)
    mask_layer4_nii_size = Column(Integer, nullable=True)
    
    # 3D mesh output
    # Config.OUTPUTS[5]: "mask_obj"
    mask_obj_path = Column(String, nullable=True)
    mask_obj_size = Column(Integer, nullable=True)

    mask_glb_path = Column(String, nullable=True)
    mask_glb_size = Column(Integer, nullable=True)
    
    temp_dataset_name = Column(String, nullable=True)
    sparc_sds_dataset_name = Column(String, nullable=True)

    case = relationship("Case", back_populates="output")

