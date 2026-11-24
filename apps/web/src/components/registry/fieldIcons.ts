import {
  faAlignLeft, faArrowDown19, faBarcode, faCalculator, faCalendarDays, faCircleChevronDown, faClock, faClockRotateLeft, faCode, faEnvelope, faEye, faFingerprint, faFont,
  faGlobe, faHandPointer, faHashtag, faLink, faList, faLocationDot, faPalette, faPaperclip, faPhone, faQrcode, faSquareCheck, faSquareRootVariable, faStar, faStopwatch, faUser, faUserPen,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import type { FieldType } from "@erp/registry";

/** The little picture in front of the name of a field: what kind of field it is, as in NocoDB. */
export const FIELD_ICONS: Record<FieldType, IconDefinition> = {
  text: faFont, longtext: faAlignLeft, email: faEnvelope, url: faGlobe, phone: faPhone, number: faHashtag, rating: faStar, checkbox: faSquareCheck,
  date: faCalendarDays, datetime: faCalendarDays, time: faClock, duration: faStopwatch, select: faCircleChevronDown, multiselect: faList, link: faLink,
  lookup: faEye, rollup: faCalculator, formula: faSquareRootVariable, attachment: faPaperclip, json: faCode, button: faHandPointer, geodata: faLocationDot,
  color: faPalette, user: faUser, uuid: faFingerprint, qrcode: faQrcode, barcode: faBarcode, autonumber: faArrowDown19, created: faClockRotateLeft,
  modified: faClockRotateLeft, creator: faUserPen, modifier: faUserPen,
};
