/**
 * A document as sync compares and stores it: serialized native content and its file name.
 * Defined in domain so the sync rules (application) and their storage (adapters) share one
 * shape without either importing the other.
 */
export interface DriveSnapshot {
  content: string;
  filename: string;
}

/** The last snapshot known to be stored in a Drive file version: the merge base. */
export interface DriveBaseline extends DriveSnapshot {
  fileId: string;
  version: string;
  /** A write whose response was lost; Drive may hold it instead of the baseline. */
  attempt?: DriveSnapshot;
}
