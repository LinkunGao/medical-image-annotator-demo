import pandas as pd
import io
from datetime import timedelta
from urllib.parse import urljoin, urlparse
from typing import List, Dict
from minio import Minio
from utils.setup import Config


class MinIOService:
    def __init__(self):
        self._client = None  # Lazy init

    @property
    def client(self) -> Minio:
        if self._client is None:
            self._client = Minio(
                endpoint=Config.MINIO_ENDPOINT,
                access_key=Config.MINIO_ACCESS_KEY,
                secret_key=Config.MINIO_SECRET_KEY,
                secure=Config.MINIO_SECURE,
            )
        return self._client

    def validate_base_url(self, base_url: str):
        if not base_url.startswith("http"):
            raise ValueError(f"Invalid MinIO base URL: {base_url}")

    def _extract_bucket_and_path(self, full_url: str) -> tuple[str, str]:
        """
        Extract (bucket, object_path) from a full MinIO URL.
        Example:
            full_url = "http://minio:9000/measurements/primary/sub1/sample1/file.nrrd"
            → ("measurements", "primary/sub1/sample1/file.nrrd")
        Works with any bucket name — no MINIO_BUCKET config needed.
        """
        parsed = urlparse(full_url)
        # parsed.path = "/measurements/primary/sub1/sample1/file.nrrd"
        parts = parsed.path.lstrip('/').split('/', 1)
        if len(parts) < 2:
            raise ValueError(f"Cannot extract bucket/path from URL: {full_url}")
        return parts[0], parts[1]  # ("measurements", "primary/.../file.nrrd")

    def fetch_excel(self, url: str) -> pd.DataFrame:
        """Fetch Excel file from MinIO via SDK (supports private bucket)."""
        try:
            bucket, object_path = self._extract_bucket_and_path(url)
            print(f"Fetching from MinIO SDK: bucket={bucket}, path={object_path}")
            response = self.client.get_object(bucket, object_path)
            data = response.read()
            response.close()
            response.release_conn()
            return pd.read_excel(io.BytesIO(data))
        except Exception as e:
            raise ValueError(f"Failed to fetch or parse {url}: {e}")

    def get_presigned_url(self, full_url: str, expires_seconds: int = None) -> str:
        """
        Generate a presigned GET URL for a MinIO object.
        full_url: the stored full MinIO URL — bucket is parsed from it automatically.
        Returns: time-limited presigned URL.
        """
        bucket, object_path = self._extract_bucket_and_path(full_url)
        expires = expires_seconds or Config.MINIO_PRESIGNED_EXPIRES
        return self.client.presigned_get_object(
            bucket,
            object_path,
            expires=timedelta(seconds=expires),
        )

    def validate_and_resolve_inputs(
        self,
        public_path: str,
        datasets: List[str],
        cohorts: List[str],
        required_inputs: List[str]
    ) -> Dict[str, Dict[str, str]]:
        """
        Validates datasets, cohorts, and inputs.
        Returns: Dict[cohort, Dict[input_type, full_url]]
        """
        if not public_path.endswith("/"):
            public_path += "/"

        # Pre-fetch metadata for all datasets
        # dataset_name -> {subjects: df, samples: df, manifest: df, url: str}
        ds_meta = {}

        # 1.2 Validate datasets exist (by fetching metadata)
        for ds in datasets:
            ds_url = urljoin(public_path, f"{ds}/")
            subjects_url = urljoin(ds_url, Config.SUBJECTS_METADATA_PATH)
            samples_url = urljoin(ds_url, Config.SAMPLES_METADATA_PATH)
            manifest_url = urljoin(ds_url, Config.METADATA_PATH)

            try:
                ds_meta[ds] = {
                    "subjects": self.fetch_excel(subjects_url),
                    "samples": self.fetch_excel(samples_url),
                    "manifest": self.fetch_excel(manifest_url),
                    "url": ds_url
                }
            except ValueError as e:
                raise ValueError(f"Dataset validation failed for '{ds}': {e}")

        # 1.3 Verify cohorts exist in ALL datasets' subjects.xlsx
        for ds_name, meta in ds_meta.items():
            subjects_df = meta['subjects']
            subject_col = next((c for c in subjects_df.columns if c.lower() == 'subject id'), None)
            if not subject_col:
                raise ValueError(f"Dataset '{ds_name}' subjects.xlsx is missing 'subject id' column.")

            existing_subjects = set(subjects_df[subject_col].astype(str).values)
            for cohort in cohorts:
                if cohort not in existing_subjects:
                    raise ValueError(f"Cohort '{cohort}' not found in dataset '{ds_name}'.")

        # 1.4 & Resolve Inputs
        resolved_paths = {cohort: {} for cohort in cohorts}

        for cohort in cohorts:
            for inp_type in required_inputs:
                found = False
                for ds_name, meta in ds_meta.items():
                    samples_df = meta['samples']
                    manifest_df = meta['manifest']

                    # Find columns
                    sample_subj_col = next((c for c in samples_df.columns if c.lower() == 'subject id'), None)
                    sample_type_col = next((c for c in samples_df.columns if c.lower() == 'sample type'), None)
                    sample_id_col = next((c for c in samples_df.columns if c.lower() == 'sample id'), None)

                    if not (sample_subj_col and sample_type_col and sample_id_col):
                        continue  # Malformed samples.xlsx

                    # Filter samples for this cohort + input type
                    match = samples_df[
                        (samples_df[sample_subj_col].astype(str) == cohort) &
                        (samples_df[sample_type_col] == inp_type)
                    ]

                    if not match.empty:
                        man_filename_col = next((c for c in manifest_df.columns if c.lower() in ['filename', 'file name']), None)
                        if not man_filename_col:
                            continue  # Malformed manifest

                        for _, row in match.iterrows():
                            subj_id_val = str(row[sample_subj_col])
                            sample_id_val = str(row[sample_id_col])

                            search_str = f"primary/{subj_id_val}/{sample_id_val}"

                            file_match = manifest_df[
                                manifest_df[man_filename_col].astype(str).str.contains(search_str, regex=False)
                            ]

                            if not file_match.empty:
                                relative_path = file_match.iloc[0][man_filename_col]
                                full_url = urljoin(meta['url'], str(relative_path))
                                resolved_paths[cohort][inp_type] = full_url
                                found = True
                                break  # Found the file for this input

                        if found:
                            break  # Found this input in this dataset
                        else:
                            resolved_paths[cohort][inp_type] = None

                if not found:
                    resolved_paths[cohort][inp_type] = None

        return resolved_paths
