/**
 * MetadataParser extracts structural information from name and date fields.
 */
export interface PostMetadata {
  id?: string;
  slip?: string;
  trip?: string;
  date: string;
}

export class MetadataParser {
  /**
   * Extracts ID, Slip, and Trip from the raw name and date strings.
   * @param name The raw name string from the dat file.
   * @param dateStr The raw date string (which often contains ID/Slip).
   */
  static parse(name: string, dateStr: string): PostMetadata {
    const result: PostMetadata = {
      date: dateStr,
    };

    // 1. Extract SLIP from name
    // Example: </b>(SLIP:xxx yyy)<b>
    const slipMatch = /<\/b>\(([^<>]+? [^<>]+?)\)<b>$/.exec(name);
    if (slipMatch) {
      result.slip = slipMatch[1];
    }

    // 2. Extract TRIP from name
    // Example: </b> ◆abcd1234ef <b>
    const tripMatch = /<\/b> ?(◆[^<>]+?) ?<b>/.exec(name);
    if (tripMatch) {
      result.trip = tripMatch[1];
    }

    // 3. Extract ID/IP from date field
    // Example: 2024/01/01(月) 00:00:00.00 ID:abcd1234
    // Example: 2024/01/01(月) 00:00:00.00 発信元:1.2.3.4
    const idMatch = /(?:^| |(\d))(ID:(?!\?\?\?)[^ <>"']+|発信元:\d+\.\d+\.\d+\.\d+)/.exec(dateStr);
    if (idMatch) {
      let fixedId = idMatch[2];
      // Remove ● mark (used for be icons etc sometimes)
      if (fixedId.endsWith("\u25cf")) {
        fixedId = fixedId.slice(0, -1);
      }
      // Extract the ID value without the "ID:" or "発信元:" prefix
      // Reason: The id field should store only the identifier value (e.g., "TestImage5"),
      // not the prefix, so that UI/indexing can work without assuming prefix format
      if (fixedId.startsWith("ID:")) {
        fixedId = fixedId.slice(3);
      } else if (fixedId.startsWith("発信元:")) {
        fixedId = fixedId.slice(4);
      }
      result.id = fixedId;
    }

    // 4. Extract pure date (optional, but good for cleanup)
    // We keep the original dateStr for now as 'date' to match main app expectations

    return result;
  }
}
