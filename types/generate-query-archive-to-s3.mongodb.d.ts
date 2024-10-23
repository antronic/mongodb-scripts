// Create the variable reference

/**
 * Backup configuration
 */
type BackupConfig = {
  /**
   * How month long we need to keep on MongoDB before we can archive to S3
   */
  monthRetention: number
  /**
   * The field we need to compare to dataRentention
   */
  timeField: string
  isTimeFieldIsString: boolean
  /**
   * The time granularity we need to compare to dataRentention
   */
  timeGanularity: 'day' | 'month' | 'year'
}

/**
 * Sink S3 configuration
 */
type SinkS3Config = {
  bucket: string
  region?: string
  filename: string
  format: {
    name: 'bson' | 'bson.gz' | 'csv' | 'csv.gz' | 'json' | 'json.gz' | 'parquet' | 'tsv' | 'tsv.gz'
    maxFileSize?: number
    /**
     * The maximum number of rows in a row group
     * Unit as a string, e.g. '128MiB'
     */
    maxRowGroupSize?: string
    /**
     * Supported for Parquet file format only.
     */
    columnCompression?: 'snappy' | 'gzip' | 'uncompressed'
  }
}