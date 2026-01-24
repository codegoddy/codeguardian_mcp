/**
 * Serialization Utilities
 *
 * Helper functions to serialize/deserialize complex objects (Maps, Sets)
 * for JSON storage. required because JSON.stringify doesn't handle Map/Set.
 *
 * @format
 */

/**
 * Replacer function for JSON.stringify to handle Map and Set
 */
export function replacer(key: string, value: any): any {
  if (value instanceof Map) {
    return {
      dataType: "Map",
      value: Array.from(value.entries()),
    };
  }
  if (value instanceof Set) {
    return {
      dataType: "Set",
      value: Array.from(value),
    };
  }
  return value;
}

/**
 * Reviver function for JSON.parse to restore Map and Set
 */
export function reviver(key: string, value: any): any {
  if (typeof value === "object" && value !== null) {
    if (value.dataType === "Map") {
      return new Map(value.value);
    }
    if (value.dataType === "Set") {
      return new Set(value.value);
    }
  }
  return value;
}

/**
 * Serialize an object to JSON string, handling Maps and Sets
 */
export function serialize(data: any): string {
  return JSON.stringify(data, replacer);
}

/**
 * Deserialize a JSON string to an object, restoring Maps and Sets
 */
export function deserialize<T>(json: string): T {
  return JSON.parse(json, reviver);
}
