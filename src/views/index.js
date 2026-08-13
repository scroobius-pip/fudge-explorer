import { registerView } from "../data/store.js";
import { vHome, vDomain, vRuntime, vRelations, vRelation } from "./meta.js";
import {
  vCapture, vSection, vCaptureGradients, vCaptureEffects, vCaptureNeighbors,
  vStructure, vMotion, vVideo, vRow, vRawCapture,
} from "./capture.js";
import { vTerm, vFacet } from "./terms.js";
import { vFamily, vDesigner, vVendor, vFontSim, vFontLookup, vEmbeddings } from "./catalog.js";
import { vBrowse, vIndex } from "./browse.js";

registerView("home", vHome);
registerView("domain", vDomain);
registerView("capture", vCapture);
registerView("term", vTerm);
registerView("facet", vFacet);
registerView("family", vFamily);
registerView("designer", vDesigner);
registerView("vendor", vVendor);
registerView("browse", vBrowse);
registerView("index", vIndex);
registerView("structure", vStructure);
registerView("motion", vMotion);
registerView("video", vVideo);
registerView("runtime", vRuntime);
registerView("section", vSection);
registerView("row", vRow);
registerView("rawCapture", vRawCapture);
registerView("relations", vRelations);
registerView("relation", vRelation);
registerView("fontSim", vFontSim);
registerView("fontLookup", vFontLookup);
registerView("embeddings", vEmbeddings);
