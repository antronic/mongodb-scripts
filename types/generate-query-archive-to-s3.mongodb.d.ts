// Create the variable reference

/**
 * Backup configuration
 */
type BackupConfig = {
  /**
   * How many month long we need to keep on MongoDB before we can archive to S3
   */
  monthToArchive: number
  /**
   * How many month long we need to keep on MongoDB before we can delete
   */
  monthToKeep: number
  /**
   * Backup the data that we keep on MongoDB
   */
  backupKeepData: boolean
  /**
   * Backup from starting point
   */
  backupFromStart: boolean

  /**
   * Backup include starting point month
   */
  includeCurrentMonth: boolean

  /**
   * The field we need to compare to dataRentention
   */
  timeField: string
  isTimeFieldIsString: boolean
  /**
   * The time granularity we need to compare to dataRentention
   * NOT SUPPORT YET
   */
  // timeGanularity: 'day' | 'month' | 'year'

  customTimeRange?: null | {
    dateTime?: string | null
    // start?: string | null
    // end?: string | null
  }
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

type SystemConfig = {
  startDateTime: Date | null
  endDateTime: Date | null
}