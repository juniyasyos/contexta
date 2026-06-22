import fs from 'fs';
import { METADATA_PATH } from './paths';

export function writeMetadata() {
  fs.writeFileSync(METADATA_PATH, JSON.stringify({ last_updated: Date.now() / 1000 }), 'utf-8');
}

export function checkFreshness() {
  if (!fs.existsSync(METADATA_PATH)) {
    console.log("No metadata.json. Rebuild Contexta.");
  } else {
    try {
      const data = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf-8'));
      const date = new Date((data.last_updated || 0) * 1000);
      console.log(`Contexta was last updated: ${date.toString()}`);
    } catch (e) {
      console.log("Error reading metadata.json.");
    }
  }
}
