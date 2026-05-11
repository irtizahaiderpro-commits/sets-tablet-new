import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ClipboardPen,
  FileText,
  Home,
  Printer,
  QrCode,
  Save,
  Search,
  ShieldAlert,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Screen =
  | "home"
  | "service"
  | "lookupSelect"
  | "supervisor"
  | "validation"
  | "driver"
  | "finalReview"
  | "record"
  | "dashboard"
  | "yardStatus"
  | "throughput"
  | "recentRecords"
  | "records"
  | "reviewNeeded"
  | "dataSeparation";
type FormTab = "intake" | "service" | "attachments";
type ServiceType =
  | "Washing"
  | "Heating / Steaming"
  | "Storage"
  | "Storage + Heating"
  | "Lift Only"
  | "Repair / Inspection";
type RecordState =
  | "Draft"
  | "Review Needed"
  | "Ready for Driver"
  | "Driver Confirmed"
  | "Ready to Print"
  | "Final Saved"
  | "Departed";

type OutputIntent = "print" | "pdf";
type ReceiptKind = "sets" | "driver";

type FormState = {
  serviceType: ServiceType;
  intakeDate: string;
  receiptNo: string;
  orderNo: string;
  customer: string;
  customerRef: string;
  tankNo: string;
  vehicleRegNo: string;
  location: string;
  cleanDirty: string;
  hazNo: string;
  lastProduct: string;
  washComments: string;
  repairComments: string;
  opsName: string;
  company: string;
  typeOfTank: string;
  noOfPots: string;
  previousProduct: string;
  cmrNo: string;
  category: string;
  comments: string;
  ecdNo: string;
  serialNo: string;
  natureOfProduct: string;
  nextLoad: string;
  procedure: string;
  additionalServices: string;
  heatingHours: string;
  outOfHoursHeating: string;
  cleanerName: string;
  timeIn: string;
  timeOut: string;
  driverName: string;
  driverCompany: string;
  driverSignature: string;
  currentYardLocation: string;
  expectedTankNo: string;
  expectedProduct: string;
  matchedBy: string;
  matchedValue: string;
  statusStage: string;
  targetTemperature: string;
  storageStartDate: string;
  attachmentNotes: string;
  photoNotes: string;
};

type SavedRecord = FormState & {
  id: string;
  status: string;
  dataQuality: "Good" | "Review";
  followUp: string;
  createdLabel: string;
  recordState: RecordState;
  isFinal: boolean;
  updatedAt: string;
};

type ReviewIssue = {
  id: string;
  label: string;
  message: string;
  field: keyof FormState;
  tab: FormTab;
  screen: Screen;
  group:
    | "Intake"
    | "Service Data"
    | "Driver Confirmation"
    | "Attachments"
    | "Future Setup";
  severity: "required" | "warning" | "future";
};

const serviceOptions: Array<{ value: ServiceType; note: string }> = [
  { value: "Washing", note: "Cleaning / ECD route" },
  {
    value: "Heating / Steaming",
    note: "Heating hours, bay and temperature route",
  },
  { value: "Storage", note: "Storage-only yard position route" },
  { value: "Storage + Heating", note: "Combined storage and heat route" },
  { value: "Lift Only", note: "Movement and receipt route" },
  { value: "Repair / Inspection", note: "Inspection or repair route" },
];

const workflowSteps = [
  "Intake",
  "Service Data",
  "Validation",
  "Driver Confirmation",
  "Final Review",
  "Saved Record",
];
const statusOptions = [
  "Booked",
  "Arrived",
  "Waiting for Wash",
  "Waiting for Heating",
  "In Progress",
  "In Storage",
  "Complete",
  "Ready for Collection",
  "Departed",
];
const badValues = new Set([
  "shunt",
  "tbc",
  "unknown",
  "not known",
  "n/a",
  "na",
  "none",
  "nil",
  "test",
  "dummy",
  "placeholder",
  "asd",
  "asdf",
  "x",
  "xx",
  "xxx",
  "-",
  ".",
  "no",
  "same",
]);

function getTodayUkDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "01";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function compact(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function isBadPlaceholder(value: string) {
  return badValues.has(compact(value));
}

function cleanSignature(value: string) {
  return value === "Signed on tablet" ? "" : value;
}

function isSuspiciousVehicleReg(value: string) {
  const raw = value.trim();
  if (!raw) return false;
  const stripped = raw.replace(/[^a-zA-Z0-9]/g, "");
  return (
    isBadPlaceholder(raw) ||
    stripped.length < 5 ||
    !/[a-zA-Z]/.test(stripped) ||
    !/\d/.test(stripped)
  );
}

function isSuspiciousName(value: string) {
  const raw = compact(value);
  if (!raw) return false;
  return isBadPlaceholder(raw) || raw.length < 3 || /^\d+$/.test(raw);
}

function isSuspiciousTankNo(value: string) {
  const raw = value.trim();
  if (!raw) return false;
  const compacted = raw.replace(/[^a-zA-Z0-9]/g, "");
  return (
    isBadPlaceholder(raw) ||
    compacted.length < 5 ||
    (!/[a-zA-Z]/.test(compacted) && !/\d/.test(compacted))
  );
}

function isSuspiciousReference(value: string) {
  const raw = compact(value);
  if (!raw) return false;
  return isBadPlaceholder(raw) || raw.length < 3;
}

function blockedLookupReason(search: string, entries: FormState[]) {
  const term = compact(search);
  if (!term) return "";
  const tankMatch = entries.some((entry) => compact(entry.tankNo) === term);
  const productMatch = entries.some((entry) =>
    [
      entry.lastProduct,
      entry.previousProduct,
      entry.natureOfProduct,
      entry.nextLoad,
    ].some((value) => compact(value) === term),
  );
  if (tankMatch)
    return "Tank No. is not allowed as a lookup key because it can change or be mistyped. Use Vehicle Reg, Order No., Receipt No., Customer Ref, ECD No. or Serial No.";
  if (productMatch)
    return "Product name is not allowed as a lookup key because product changes job-to-job. Use Vehicle Reg, Order No., Receipt No., Customer Ref, ECD No. or Serial No.";
  return "";
}

const defaultDraft: FormState = {
  serviceType: "Washing",
  intakeDate: getTodayUkDate(),
  receiptNo: "",
  orderNo: "",
  customer: "",
  customerRef: "",
  tankNo: "",
  vehicleRegNo: "",
  location: "In",
  cleanDirty: "Dirty",
  hazNo: "",
  lastProduct: "",
  washComments: "",
  repairComments: "",
  opsName: "",
  company: "",
  typeOfTank: "T11 ISO Tank",
  noOfPots: "1",
  previousProduct: "",
  cmrNo: "",
  category: "",
  comments: "",
  ecdNo: "",
  serialNo: "",
  natureOfProduct: "",
  nextLoad: "",
  procedure: "",
  additionalServices: "",
  heatingHours: "",
  outOfHoursHeating: "",
  cleanerName: "",
  timeIn: "",
  timeOut: "",
  driverName: "",
  driverCompany: "",
  driverSignature: "",
  currentYardLocation: "Intake Area",
  expectedTankNo: "",
  expectedProduct: "",
  matchedBy: "",
  matchedValue: "",
  statusStage: "Arrived",
  targetTemperature: "",
  storageStartDate: "",
  attachmentNotes: "",
  photoNotes: "",
};

const prebookedEntries: FormState[] = [
  {
    ...defaultDraft,
    serviceType: "Heating / Steaming",
    intakeDate: getTodayUkDate(),
    receiptNo: "38304",
    orderNo: "3629174",
    customer: "D. Hartogh",
    customerRef: "3629174",
    tankNo: "DHDU2073216",
    expectedTankNo: "DHDU2073216",
    vehicleRegNo: "",
    cleanDirty: "Clean",
    lastProduct: "PEG 8000",
    expectedProduct: "PEG 8000",
    company: "D. Hartogh",
    previousProduct: "PEG 8000",
    category: "CHEMICAL",
    ecdNo: "4660548",
    serialNo: "501-417277",
    natureOfProduct: "PEG 8000",
    procedure: "P40 Steaming",
    additionalServices: "E92 Steam Heating, H99 Energy Surcharge",
    heatingHours: "79",
    outOfHoursHeating: "72",
    targetTemperature: "105°C",
    cleanerName: "Jamie Hales",
    timeIn: "10:00",
    timeOut: "06:00",
    currentYardLocation: "Heating Bay 2",
    statusStage: "Waiting for Heating",
    attachmentNotes:
      "ECD details pre-loaded. Vehicle registration and driver details still require clean confirmation.",
  },
  {
    ...defaultDraft,
    serviceType: "Washing",
    intakeDate: getTodayUkDate(),
    receiptNo: "163738",
    orderNo: "3667214",
    customer: "VW1086 DEN HARTOGH LIQUID LOGISTICS BV",
    customerRef: "3686236",
    tankNo: "DHIU2052994",
    expectedTankNo: "DHIU2052994",
    vehicleRegNo: "GN22YND",
    cleanDirty: "Dirty",
    lastProduct: "INFINEUM",
    expectedProduct: "INFINEUM",
    company: "VW1086 DEN HARTOGH LIQUID LOGISTICS BV",
    previousProduct: "INFINEUM",
    category: "CHEMICAL",
    ecdNo: "4660549",
    serialNo: "501-417276",
    natureOfProduct: "INFINEUM",
    procedure: "E05 Degas, P10 Hot Water Spin, P30 Drying",
    cleanerName: "Dan Russell",
    timeIn: "09:32",
    currentYardLocation: "Intake Area",
    statusStage: "Waiting for Wash",
  },
];

function normalizeDraft(raw: Partial<FormState> = {}): FormState {
  const merged = { ...defaultDraft, ...raw };
  return {
    ...merged,
    intakeDate: merged.intakeDate || getTodayUkDate(),
    storageStartDate: merged.storageStartDate || "",
    vehicleRegNo: (merged.vehicleRegNo || "")
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim(),
    driverSignature: cleanSignature(merged.driverSignature || ""),
    expectedTankNo: merged.expectedTankNo || "",
    expectedProduct: merged.expectedProduct || "",
    matchedBy: merged.matchedBy || "",
    matchedValue: merged.matchedValue || "",
  };
}

function issue(
  id: string,
  label: string,
  message: string,
  field: keyof FormState,
  tab: FormTab,
  screen: Screen,
  group: ReviewIssue["group"],
  severity: ReviewIssue["severity"] = "required",
): ReviewIssue {
  return { id, label, message, field, tab, screen, group, severity };
}

function blockingIssues(issues: ReviewIssue[]) {
  return issues.filter((item) => item.severity === "required");
}

function qualityWarnings(issues: ReviewIssue[]) {
  return issues.filter((item) => item.severity !== "required");
}

function getReviewIssues(form: FormState, includeDriver = true): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const customer = form.customer.trim() || form.company.trim();

  if (!form.tankNo.trim())
    issues.push(
      issue(
        "tankNo",
        "Tank No. missing",
        "Add the ISO tank/container number.",
        "tankNo",
        "intake",
        "supervisor",
        "Intake",
      ),
    );
  if (isSuspiciousTankNo(form.tankNo))
    issues.push(
      issue(
        "tankNoBad",
        "Tank No. needs later format check",
        "Mock-up accepts this value, but before live use SETS must define what a valid tank/container number should look like.",
        "tankNo",
        "intake",
        "supervisor",
        "Intake",
        "warning",
      ),
    );
  if (!customer)
    issues.push(
      issue(
        "customer",
        "Customer/company missing",
        "Add the customer or company name.",
        "customer",
        "intake",
        "supervisor",
        "Intake",
      ),
    );
  if (isBadPlaceholder(customer))
    issues.push(
      issue(
        "customerBad",
        "Customer/company looks like test data",
        "Mock-up accepts it for demonstration, but live use should block placeholder customer names.",
        "customer",
        "intake",
        "supervisor",
        "Intake",
        "warning",
      ),
    );
  if (!form.orderNo.trim() && !form.receiptNo.trim())
    issues.push(
      issue(
        "orderNo",
        "Order/receipt missing",
        "Add an order number or receipt/reference number.",
        "orderNo",
        "intake",
        "supervisor",
        "Intake",
      ),
    );
  if (
    isSuspiciousReference(form.orderNo) ||
    isSuspiciousReference(form.receiptNo)
  )
    issues.push(
      issue(
        "referenceBad",
        "Order/receipt needs later format check",
        "Mock-up accepts this reference, but live use should validate order and receipt formats once SETS confirms the rules.",
        "orderNo",
        "intake",
        "supervisor",
        "Intake",
        "warning",
      ),
    );
  if (!form.vehicleRegNo.trim())
    issues.push(
      issue(
        "vehicleRegNo",
        "Vehicle Reg No. missing",
        "Add the real vehicle registration. Do not use Shunt/TBC/Unknown.",
        "vehicleRegNo",
        "intake",
        "supervisor",
        "Intake",
      ),
    );
  if (isSuspiciousVehicleReg(form.vehicleRegNo))
    issues.push(
      issue(
        "vehicleRegNoBad",
        "Vehicle Reg No. needs confirmation",
        "Mock-up accepts flexible text for now. Live use should validate registration format and block values like Shunt/TBC/Unknown.",
        "vehicleRegNo",
        "intake",
        "supervisor",
        "Intake",
        "warning",
      ),
    );
  if (!form.opsName.trim())
    issues.push(
      issue(
        "opsName",
        "Operator/supervisor missing",
        "Add the operator/supervisor responsible for intake before driver confirmation.",
        "opsName",
        "intake",
        "supervisor",
        "Intake",
      ),
    );
  if (isSuspiciousName(form.opsName))
    issues.push(
      issue(
        "opsNameBad",
        "Operator name looks like test data",
        "Mock-up accepts this value for now, but live use should require a real operator/supervisor name.",
        "opsName",
        "intake",
        "supervisor",
        "Intake",
        "warning",
      ),
    );

  if (form.serviceType === "Washing") {
    if (!form.previousProduct.trim() && !form.lastProduct.trim())
      issues.push(
        issue(
          "previousProduct",
          "Previous product missing",
          "Add the previous/last product before cleaning.",
          "previousProduct",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
    if (!form.category.trim())
      issues.push(
        issue(
          "category",
          "Category missing",
          "Add product category such as chemical/food grade/hazardous.",
          "category",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
    if (!form.procedure.trim())
      issues.push(
        issue(
          "procedure",
          "Wash procedure missing",
          "Add the wash/cleaning procedure.",
          "procedure",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
    if (!form.cleanDirty.trim())
      issues.push(
        issue(
          "cleanDirty",
          "Clean/dirty status missing",
          "Confirm whether the tank arrived clean or dirty.",
          "cleanDirty",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
  }

  if (
    form.serviceType === "Heating / Steaming" ||
    form.serviceType === "Storage + Heating"
  ) {
    if (!form.heatingHours.trim())
      issues.push(
        issue(
          "heatingHours",
          "Heating hours missing",
          "Add expected or actual heating hours.",
          "heatingHours",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
    if (!form.targetTemperature.trim())
      issues.push(
        issue(
          "targetTemperature",
          "Target temperature missing",
          "Add the heating target temperature.",
          "targetTemperature",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
    if (!form.timeIn.trim())
      issues.push(
        issue(
          "timeIn",
          "Start time missing",
          "Add heating/start time.",
          "timeIn",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
    if (!form.currentYardLocation.trim())
      issues.push(
        issue(
          "currentYardLocation",
          "Bay/location missing",
          "Add the heating bay or yard location.",
          "currentYardLocation",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
  }

  if (
    form.serviceType === "Storage" ||
    form.serviceType === "Storage + Heating"
  ) {
    if (!form.currentYardLocation.trim())
      issues.push(
        issue(
          "currentYardLocationStorage",
          "Storage location missing",
          "Add the storage yard location.",
          "currentYardLocation",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
    if (!form.storageStartDate.trim())
      issues.push(
        issue(
          "storageStartDate",
          "Storage start date missing",
          "Add the storage start date.",
          "storageStartDate",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
    if (!form.customerRef.trim() && !form.orderNo.trim())
      issues.push(
        issue(
          "customerRef",
          "Customer reference missing",
          "Add the customer reference or order number.",
          "customerRef",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
  }

  if (form.serviceType === "Lift Only") {
    if (!form.receiptNo.trim())
      issues.push(
        issue(
          "receiptNo",
          "Lift receipt missing",
          "Add the lift receipt/reference number.",
          "receiptNo",
          "intake",
          "supervisor",
          "Intake",
        ),
      );
    if (!form.opsName.trim())
      issues.push(
        issue(
          "opsName",
          "Operator/supervisor missing",
          "Add the operator or supervisor name.",
          "opsName",
          "intake",
          "supervisor",
          "Intake",
        ),
      );
    if (!form.currentYardLocation.trim())
      issues.push(
        issue(
          "currentYardLocationLift",
          "Drop location missing",
          "Add the lift/drop location.",
          "currentYardLocation",
          "service",
          "supervisor",
          "Service Data",
        ),
      );
  }

  if (
    form.expectedTankNo &&
    form.tankNo &&
    compact(form.expectedTankNo) !== compact(form.tankNo)
  )
    issues.push(
      issue(
        "tankMismatch",
        "Actual tank differs from expected",
        "This may be correct, but the operator should confirm why the actual tank differs from the pre-booked tank.",
        "tankNo",
        "intake",
        "supervisor",
        "Intake",
        "warning",
      ),
    );
  if (
    form.expectedProduct &&
    (form.previousProduct || form.lastProduct) &&
    ![form.previousProduct, form.lastProduct, form.natureOfProduct].some(
      (value) => compact(value) === compact(form.expectedProduct),
    )
  )
    issues.push(
      issue(
        "productMismatch",
        "Actual product differs from expected",
        "This may be correct, but the operator should confirm why the product differs from pre-booked details.",
        "previousProduct",
        "service",
        "supervisor",
        "Service Data",
        "warning",
      ),
    );

  if (includeDriver) {
    if (!form.driverName.trim())
      issues.push(
        issue(
          "driverName",
          "Driver name missing",
          "Add the real driver name.",
          "driverName",
          "intake",
          "driver",
          "Driver Confirmation",
        ),
      );
    if (isSuspiciousName(form.driverName))
      issues.push(
        issue(
          "driverNameBad",
          "Driver name looks like test data",
          "Mock-up accepts this value for now, but live use should block placeholder driver names.",
          "driverName",
          "intake",
          "driver",
          "Driver Confirmation",
          "warning",
        ),
      );
    if (!form.driverCompany.trim())
      issues.push(
        issue(
          "driverCompany",
          "Driver company missing",
          "Add the real haulier/company name.",
          "driverCompany",
          "intake",
          "driver",
          "Driver Confirmation",
        ),
      );
    if (isSuspiciousName(form.driverCompany))
      issues.push(
        issue(
          "driverCompanyBad",
          "Driver company looks like test data",
          "Mock-up accepts this value for now, but live use should block placeholder haulier/company names.",
          "driverCompany",
          "intake",
          "driver",
          "Driver Confirmation",
          "warning",
        ),
      );
    if (!cleanSignature(form.driverSignature).trim())
      issues.push(
        issue(
          "driverSignature",
          "Driver signature missing",
          "Capture the driver signature on the tablet.",
          "driverSignature",
          "intake",
          "driver",
          "Driver Confirmation",
        ),
      );
  }

  return issues;
}

function getDefaultStatus(form: FormState) {
  if (form.statusStage && statusOptions.includes(form.statusStage))
    return form.statusStage;
  if (form.serviceType === "Washing") return "Waiting for Wash";
  if (form.serviceType === "Heating / Steaming") return "Waiting for Heating";
  if (
    form.serviceType === "Storage" ||
    form.serviceType === "Storage + Heating"
  )
    return "In Storage";
  if (form.serviceType === "Repair / Inspection") return "In Progress";
  return "Arrived";
}

function getRecordState(form: FormState, isFinal: boolean): RecordState {
  if (form.statusStage === "Departed") return "Departed";
  const preDriverIssues = blockingIssues(getReviewIssues(form, false));
  const allIssues = blockingIssues(getReviewIssues(form, true));
  if (allIssues.length && preDriverIssues.length) return "Review Needed";
  if (
    !preDriverIssues.length &&
    allIssues.some((item) => item.group === "Driver Confirmation")
  )
    return "Ready for Driver";
  if (!allIssues.length && !isFinal) return "Ready to Print";
  if (!allIssues.length && isFinal) return "Final Saved";
  return "Review Needed";
}

function makeRecord(
  form: FormState,
  id = `rec-${Date.now()}`,
  isFinal = false,
): SavedRecord {
  const normalized = normalizeDraft(form);
  const issues = getReviewIssues(normalized, true);
  const required = blockingIssues(issues);
  const recordState = getRecordState(normalized, isFinal);
  return {
    ...normalized,
    id,
    status: getDefaultStatus(normalized),
    dataQuality: issues.length ? "Review" : "Good",
    followUp: issues.length
      ? issues.map((item) => item.label).join(" • ")
      : "None",
    createdLabel:
      `${normalized.intakeDate || getTodayUkDate()} ${normalized.timeIn || ""}`.trim(),
    recordState,
    isFinal: isFinal && required.length === 0,
    updatedAt: new Date().toISOString(),
  };
}

const seedRecords: SavedRecord[] = [
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Washing",
      tankNo: "T-5248",
      customer: "Global Fuels Ltd",
      company: "Global Fuels Ltd",
      orderNo: "ORD-78236",
      receiptNo: "163700",
      customerRef: "GF-78236",
      vehicleRegNo: "AB12CDE",
      lastProduct: "Gasoil",
      previousProduct: "Gasoil",
      category: "CHEMICAL",
      procedure: "Hot wash and dry",
      cleanerName: "James Collins",
      opsName: "Mark Evans",
      driverName: "James Collins",
      driverCompany: "Global Fuels Ltd",
      driverSignature: "Captured signature",
      currentYardLocation: "Yard A – Bay 3",
      timeIn: "09:15",
      statusStage: "In Progress",
    },
    "seed-clean-1",
    true,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Heating / Steaming",
      tankNo: "DHDU2073216",
      customer: "D. Hartogh",
      company: "D. Hartogh",
      orderNo: "3629174",
      receiptNo: "38304",
      customerRef: "3629174",
      vehicleRegNo: "GN22YND",
      previousProduct: "PEG 8000",
      lastProduct: "PEG 8000",
      category: "CHEMICAL",
      procedure: "P40 Steaming",
      heatingHours: "79",
      targetTemperature: "105°C",
      timeIn: "10:00",
      timeOut: "06:00",
      opsName: "Jamie Hales",
      driverName: "Roger Smith",
      driverCompany: "D. Hartogh",
      driverSignature: "Captured signature",
      currentYardLocation: "Heating Bay 2",
      statusStage: "Waiting for Heating",
    },
    "seed-clean-2",
    true,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Washing",
      tankNo: "DHIU2052994",
      customer: "Den Hartogh Liquid Logistics BV",
      company: "Den Hartogh Liquid Logistics BV",
      orderNo: "3667214",
      receiptNo: "163738",
      customerRef: "3686236",
      vehicleRegNo: "GN22YND",
      previousProduct: "INFINEUM",
      lastProduct: "INFINEUM",
      category: "CHEMICAL",
      procedure: "E05 Degas, P10 Hot Water Spin, P30 Drying",
      cleanerName: "Dan Russell",
      opsName: "Chris Howard",
      driverName: "Roger Smith",
      driverCompany: "Den Hartogh",
      driverSignature: "Captured signature",
      currentYardLocation: "Intake Area",
      timeIn: "09:32",
      statusStage: "Waiting for Wash",
    },
    "seed-clean-3",
    true,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Storage",
      tankNo: "SETX104882",
      customer: "Bulkhaul",
      company: "Bulkhaul",
      orderNo: "3667350",
      customerRef: "BH-105",
      vehicleRegNo: "BK22OIL",
      currentYardLocation: "Storage Area A",
      storageStartDate: getTodayUkDate(),
      opsName: "Liam Foster",
      driverName: "Alan Morris",
      driverCompany: "Bulkhaul",
      driverSignature: "Captured signature",
      statusStage: "In Storage",
    },
    "seed-clean-4",
    true,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Storage + Heating",
      tankNo: "NTRU948211",
      customer: "Apex Energy",
      company: "Apex Energy",
      orderNo: "APX-4170",
      customerRef: "APX-YARD-118",
      vehicleRegNo: "HX71LPT",
      previousProduct: "Base Oil",
      category: "CHEMICAL",
      procedure: "Storage with temperature hold",
      heatingHours: "16",
      targetTemperature: "65°C",
      timeIn: "07:45",
      currentYardLocation: "Heating Bay 4",
      storageStartDate: getTodayUkDate(),
      opsName: "Peter Lowe",
      driverName: "Martin Price",
      driverCompany: "Apex Logistics",
      driverSignature: "Captured signature",
      statusStage: "Waiting for Heating",
    },
    "seed-clean-5",
    true,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Washing",
      tankNo: "TCLU775190",
      customer: "North Star Fuels",
      company: "North Star Fuels",
      orderNo: "NSF-9021",
      receiptNo: "163744",
      vehicleRegNo: "MW70KLD",
      previousProduct: "Diesel Additive",
      lastProduct: "Diesel Additive",
      category: "CHEMICAL",
      procedure: "Food-grade wash not required, chemical wash route",
      cleanerName: "Owen Harris",
      opsName: "Mark Evans",
      driverName: "Neil Cooper",
      driverCompany: "North Star Transport",
      driverSignature: "Captured signature",
      currentYardLocation: "Wash Lane 1",
      timeIn: "08:10",
      statusStage: "Waiting for Wash",
    },
    "seed-clean-6",
    true,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Heating / Steaming",
      tankNo: "EXFU551208",
      customer: "Blue Ocean Ltd",
      company: "Blue Ocean Ltd",
      orderNo: "BO-5108",
      vehicleRegNo: "PX23KLM",
      previousProduct: "Biodiesel",
      category: "CHEMICAL",
      procedure: "Steam heating",
      heatingHours: "24",
      targetTemperature: "70°C",
      timeIn: "11:20",
      currentYardLocation: "Heating Bay 1",
      opsName: "Sarah Kent",
      driverName: "David White",
      driverCompany: "Blue Ocean Ltd",
      driverSignature: "Captured signature",
      statusStage: "In Progress",
    },
    "seed-clean-7",
    true,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Repair / Inspection",
      tankNo: "SUNU880511",
      customer: "Sunrise Fuels",
      company: "Sunrise Fuels",
      orderNo: "SF-3317",
      vehicleRegNo: "LK21ZTR",
      currentYardLocation: "Inspection Bay",
      procedure: "Visual inspection and minor valve check",
      opsName: "Peter Lowe",
      driverName: "Ian Barber",
      driverCompany: "Sunrise Fuels",
      driverSignature: "Captured signature",
      statusStage: "In Progress",
    },
    "seed-clean-8",
    true,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Lift Only",
      tankNo: "LIFT204771",
      customer: "Crest Logistics",
      company: "Crest Logistics",
      receiptNo: "LFT-20477",
      vehicleRegNo: "KN19WRT",
      currentYardLocation: "Drop Zone 2",
      opsName: "Liam Foster",
      driverName: "Chris Morgan",
      driverCompany: "Crest Logistics",
      driverSignature: "Captured signature",
      statusStage: "Complete",
    },
    "seed-clean-9",
    true,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Washing",
      tankNo: "MSTU331004",
      customer: "Meridian Chemicals",
      company: "Meridian Chemicals",
      orderNo: "MC-1182",
      vehicleRegNo: "HV22MDC",
      previousProduct: "Latex Solution",
      lastProduct: "Latex Solution",
      category: "CHEMICAL",
      procedure: "Hot wash and air dry",
      cleanerName: "Dan Russell",
      opsName: "Chris Howard",
      currentYardLocation: "Wash Lane 2",
      timeIn: "12:05",
      statusStage: "Waiting for Wash",
    },
    "seed-review-1",
    false,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Heating / Steaming",
      tankNo: "HGRU220145",
      customer: "Harbour Group",
      company: "Harbour Group",
      orderNo: "HG-2401",
      receiptNo: "163752",
      customerRef: "HG-2401",
      vehicleRegNo: "MM72HGR",
      previousProduct: "Wax Blend",
      lastProduct: "Wax Blend",
      category: "CHEMICAL",
      procedure: "Steam heating",
      heatingHours: "18",
      targetTemperature: "72°C",
      timeIn: "13:30",
      currentYardLocation: "Heating Bay 3",
      opsName: "Jamie Hales",
      driverName: "Tom Wilson",
      driverCompany: "Harbour Transport",
      driverSignature: "Captured signature",
      statusStage: "Waiting for Heating",
    },
    "seed-clean-10",
    true,
  ),
  makeRecord(
    {
      ...defaultDraft,
      serviceType: "Storage",
      tankNo: "STRG441092",
      customer: "Falcon Storage",
      company: "Falcon Storage",
      orderNo: "FS-4410",
      receiptNo: "163755",
      customerRef: "FS-OPS-4410",
      vehicleRegNo: "EF71STR",
      currentYardLocation: "Storage Area C",
      storageStartDate: getTodayUkDate(),
      opsName: "Sarah Kent",
      driverName: "Ben Carter",
      driverCompany: "Falcon Transport",
      driverSignature: "Captured signature",
      statusStage: "In Storage",
    },
    "seed-clean-11",
    true,
  ),
];

function loadStoredRecords() {
  try {
    const raw = localStorage.getItem("sets-v41-records");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedRecord[];
    return parsed.map((item) => makeRecord(item, item.id, item.isFinal));
  } catch {
    return [];
  }
}

function mergeRecords(primary: SavedRecord[], fallback: SavedRecord[]) {
  const seen = new Set(primary.map((record) => record.id));
  return [...primary, ...fallback.filter((record) => !seen.has(record.id))];
}

function isDemoRecord(record: SavedRecord) {
  return record.id.startsWith("seed-");
}

function recordSourceLabel(record: SavedRecord) {
  if (isDemoRecord(record)) return "Demo sample";
  if (record.isFinal) return "Live final";
  if (record.recordState === "Review Needed" || record.dataQuality === "Review")
    return "Live draft";
  return "Live record";
}

function recordSourceTone(
  record: SavedRecord,
): "neutral" | "good" | "warn" | "danger" | "dark" | "blue" {
  if (isDemoRecord(record)) return "blue";
  if (record.isFinal) return "good";
  if (record.recordState === "Review Needed" || record.dataQuality === "Review")
    return "warn";
  return "neutral";
}

function recordOutputLabel(record: SavedRecord) {
  if (record.recordState === "Final Saved" && record.isFinal)
    return "FINAL SAVED RECORD";
  if (blockingIssues(getReviewIssues(record, true)).length)
    return "DRAFT / REVIEW NEEDED";
  return "READY TO PRINT";
}

function recordOutputTone(
  record: SavedRecord,
): "neutral" | "good" | "warn" | "danger" | "dark" | "blue" {
  if (record.recordState === "Final Saved" && record.isFinal) return "good";
  if (blockingIssues(getReviewIssues(record, true)).length) return "warn";
  return "blue";
}

function recordOutputMessage(record: SavedRecord) {
  const label = recordOutputLabel(record);
  if (label === "FINAL SAVED RECORD") {
    return "This output is final and suitable for client/admin use.";
  }
  if (label === "READY TO PRINT") {
    return "Required fields are complete, but the record has not yet been marked as final.";
  }
  return "This output is a draft only. It must not be treated as a final saved record until review items are fixed.";
}

function outputFileName(record: SavedRecord, intent: OutputIntent) {
  const safeTank = (record.tankNo || record.expectedTankNo || "draft-record")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  const label = recordOutputLabel(record).replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `SETS-${safeTank}-${label}-${intent.toUpperCase()}`;
}

function PrintExportNotice({
  record,
  intent,
}: {
  record: SavedRecord;
  intent: OutputIntent;
}) {
  const label = recordOutputLabel(record);
  const final = label === "FINAL SAVED RECORD";
  const ready = label === "READY TO PRINT";
  return (
    <div
      className={`print-status-strip rounded-2xl border p-4 ${
        final
          ? "border-[#86EFAC] bg-[#F0FDF4] text-[#166534]"
          : ready
            ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]"
            : "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em]">
            {intent === "pdf" ? "PDF export label" : "Print label"}
          </p>
          <h3 className="mt-1 text-xl font-black">{label}</h3>
          <p className="mt-1 text-sm font-bold leading-6">
            {recordOutputMessage(record)}
          </p>
        </div>
        <div className="rounded-xl border border-current/20 bg-white/65 px-3 py-2 text-right text-xs font-black uppercase tracking-[0.12em]">
          {intent === "pdf" ? "Save as PDF" : "Print output"}
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-xs font-bold leading-5 md:grid-cols-3">
        <p>Tank: {record.tankNo || record.expectedTankNo || "Draft"}</p>
        <p>State: {record.recordState}</p>
        <p>Updated: {new Date(record.updatedAt).toLocaleString()}</p>
      </div>
    </div>
  );
}


function PrintRecordDocument({
  record,
  intent,
  receiptKind,
}: {
  record: SavedRecord;
  intent: OutputIntent;
  receiptKind: ReceiptKind;
}) {
  return receiptKind === "driver" ? (
    <DriverReceiptDocument record={record} intent={intent} />
  ) : (
    <SetsReceiptDocument record={record} intent={intent} />
  );
}

function safeReceiptValue(value?: string, fallback = "") {
  const cleaned = (value || "").trim();
  return cleaned || fallback;
}

function SetsReceiptDocument({
  record,
  intent,
}: {
  record: SavedRecord;
  intent: OutputIntent;
}) {
  const today = record.intakeDate || getTodayUkDate();
  const cleanNo = safeReceiptValue(record.ecdNo, safeReceiptValue(record.receiptNo, "4660548"));
  const serialNo = safeReceiptValue(record.serialNo, "501-417277");
  const tankNo = safeReceiptValue(record.tankNo, safeReceiptValue(record.expectedTankNo, "—"));
  const previousLoad = safeReceiptValue(record.previousProduct, safeReceiptValue(record.lastProduct, safeReceiptValue(record.expectedProduct, "—")));
  const customer = safeReceiptValue(record.customer, safeReceiptValue(record.company, "—"));
  const cleaner = safeReceiptValue(record.cleanerName, safeReceiptValue(record.opsName, "—")).toUpperCase();
  const driver = safeReceiptValue(record.driverName, "—").toUpperCase();
  const comments = safeReceiptValue(
    record.comments || record.washComments,
    `SOC ${record.heatingHours || ""} HRS\nON AT ${record.timeIn || ""} ${today}\nOFF AT ${record.timeOut || ""} ${today} TEMP ${record.targetTemperature || ""}\nOIL FLUSHED`,
  );
  const serviceRows = [
    { code: "E99", description: "MISCELLANEOUS", qty: "" },
    { code: "E99", description: "MISCELLANEOUS", qty: "" },
    { code: "P40", description: safeReceiptValue(record.procedure, "STEAMING").toUpperCase(), qty: record.serviceType.includes("Heating") ? "1 mins" : "" },
    { code: "E92", description: "STEAM HEATING", qty: record.heatingHours ? `${record.heatingHours} hours` : "" },
    { code: "E92", description: "STEAM HEATING OUT OF HOURS", qty: record.outOfHoursHeating ? `${record.outOfHoursHeating} hours` : "" },
    { code: "H99", description: "Energy Surcharge", qty: "1 units" },
  ];

  return (
    <div className="sets-receipt print-only">
      <div className="sets-copy-watermark">Office Copy</div>
      <div className="sets-edge-pattern" />
      <header className="sets-receipt-header">
        <div className="sets-eftco-brand">
          <div className="sets-eftco-oval">EFTCO</div>
          <b>www.eftco.org</b>
        </div>
        <div className="sets-document-title">
          <div>EFTCO Cleaning Document ©</div>
          <p><b>GB</b><span>{cleanNo}</span></p>
        </div>
        <div className="sets-nrttca">
          <b>www.nrttca.co.uk</b><br />
          +44 (0)1977 600707<br />
          +44 (0)1977 607004
        </div>
        <div className="sets-logo-box"><img src="./sets-logo.png" alt="SETS" /></div>
      </header>

      <main className="sets-form-grid">
        <section className="sets-box sets-company">
          <span className="sets-box-no">1</span>
          <p>SOUTH EASTERN TANKER SERVICES LTD.<br />BREACH LANE<br />DAGENHAM<br />ESSEX RM9 6EG<br />TEL: 020 8593 4999<br />FAX: 020 8593 7811</p>
          <p>EMAIL: INFO@SETANKERS.COM&nbsp;&nbsp;&nbsp;&nbsp; WWW.SETANKERS.COM</p>
        </section>
        <section className="sets-box sets-blank-top" />

        <section className="sets-box sets-small"><span className="sets-box-no">2</span><label>Customer reference number*</label><b>{safeReceiptValue(record.customerRef, safeReceiptValue(record.orderNo, "—"))}</b></section>
        <section className="sets-box sets-small"><span className="sets-box-no">3</span><label>Serial number</label><b>{serialNo}</b></section>

        <section className="sets-box sets-customer"><span className="sets-box-no">4</span><label>Customer</label><p>{customer}</p></section>
        <section className="sets-box sets-ident"><span className="sets-box-no">5</span><label>Identification numbers</label><p><span>Vehicle</span><b>{safeReceiptValue(record.vehicleRegNo, "SHUNT")}</b></p><p><span>Tank Container</span><b>{tankNo}</b></p></section>

        <section className="sets-box sets-product"><span className="sets-box-no">6</span><label>Nature of product</label><b>{safeReceiptValue(record.category || record.natureOfProduct, "CHEMICAL HAZARDOUS")}</b><label className="sets-prev-label">Previous load</label><div className="sets-prev-table"><span>Comp</span><span>UN N°</span><span>Name</span><i></i><i></i><b>{previousLoad}</b></div></section>
        <section className="sets-box sets-services"><span className="sets-box-no">7</span><label>Next Load*</label><div className="sets-next-load">{safeReceiptValue(record.nextLoad, "—")}</div><span className="sets-box-no sets-nine">9</span><label>Cleaning Procedures</label><div className="sets-service-head"><span>EFTCO Code / Description*</span><span>Qty</span></div><table><tbody>{serviceRows.map((row, idx) => (<tr key={`${row.code}-${idx}`}><td>{row.code}</td><td>{row.description}</td><td>{row.qty}</td></tr>))}</tbody></table></section>

        <section className="sets-box sets-additional"><span className="sets-box-no">10</span><label>Additional Services</label><p>{safeReceiptValue(record.additionalServices, "")}</p></section>
        <section className="sets-box sets-comments"><span className="sets-box-no">11</span><label>Comments</label><p>{comments}</p></section>
        <section className="sets-box sets-cleaner"><span className="sets-box-no">12</span><label>Name cleaner*</label><b>1 - {cleaner}</b></section>
        <section className="sets-box sets-times"><span className="sets-box-no">13</span><label>Time In*</label><b>{safeReceiptValue(record.timeIn, "—")}</b><label>Time Out</label><b>{safeReceiptValue(record.timeOut, "—")}</b></section>
        <section className="sets-box sets-declaration">The cleaning station and the driver confirm that the above service(s) to clean the tank have been carried out according to the EFTCO definition of ‘clean’.</section>
        <section className="sets-box sets-station"><span className="sets-box-no">14</span><label>Cleaning Station</label><p>Name - {cleaner}</p><div>Signature</div><strong className="sets-scribble">L S H</strong></section>
        <section className="sets-box sets-driver"><span className="sets-box-no">15</span><label>Driver*</label><p>Name&nbsp;&nbsp;&nbsp; {driver}</p><div>Signature</div><strong className="sets-scribble faint">{record.driverSignature ? "Signed" : ""}</strong></section>
      </main>

      <footer className="sets-receipt-footer"><span>{safeReceiptValue(record.receiptNo, "38304")}</span><span>Office</span><span>{today}</span><span>{intent === "pdf" ? "PDF" : "Print"}</span></footer>
    </div>
  );
}

function DriverReceiptDocument({
  record,
  intent,
}: {
  record: SavedRecord;
  intent: OutputIntent;
}) {
  const today = safeReceiptValue(record.intakeDate, getTodayUkDate());
  const receiptNo = safeReceiptValue(record.receiptNo, "38304");
  const orderNo = safeReceiptValue(record.orderNo, safeReceiptValue(record.customerRef, "—"));
  const tankNo = safeReceiptValue(record.tankNo, safeReceiptValue(record.expectedTankNo, "—"));
  const vehicleReg = safeReceiptValue(record.vehicleRegNo, "—");
  const company = safeReceiptValue(record.customer || record.company || record.driverCompany, "—");
  const tankType = safeReceiptValue(record.typeOfTank, "T11");
  const noOfPots = safeReceiptValue(record.noOfPots, "1");
  const previousLoad = safeReceiptValue(
    record.previousProduct || record.lastProduct || record.expectedProduct,
    "—",
  );
  const category = safeReceiptValue(record.category || record.natureOfProduct, "—");
  const driver = safeReceiptValue(record.driverName, "—");
  const signature = record.driverSignature ? "Signed" : "";
  const commentLines = [
    record.comments,
    record.washComments,
    record.procedure ? `Procedure: ${record.procedure}` : "",
    record.heatingHours ? `Heating / SOC: ${record.heatingHours} hrs` : "",
    record.timeIn ? `On at: ${record.timeIn} ${today}` : "",
    record.timeOut ? `Off at: ${record.timeOut} ${today}` : "",
    record.targetTemperature ? `Temp: ${record.targetTemperature}` : "",
    record.additionalServices ? `Additional: ${record.additionalServices}` : "",
  ].filter((line) => line && line.trim().length > 0);
  const comments = commentLines.length ? commentLines.join("\n") : "";

  return (
    <div className="driver-receipt print-only">
      <table className="driver-slip-table driver-slip-top"><tbody>
        <tr>
          <th>Date</th>
          <td className="driver-hand driver-date">{today}</td>
          <td className="driver-receipt-no" rowSpan={2}>{receiptNo}</td>
          <th>Order No.</th>
          <td className="driver-hand">{orderNo}</td>
        </tr>
      </tbody></table>

      <table className="driver-slip-table"><tbody>
        <tr>
          <th>Company</th>
          <td className="driver-hand" colSpan={3}>{company}</td>
        </tr>
        <tr>
          <th>Veh. Reg. No</th>
          <td className="driver-hand">{vehicleReg}</td>
          <th>Type of Tank</th>
          <td className="driver-hand">{tankType}</td>
        </tr>
        <tr>
          <th>Tank No</th>
          <td className="driver-hand">{tankNo}</td>
          <th>No of Pots</th>
          <td className="driver-hand">{noOfPots}</td>
        </tr>
        <tr>
          <th>Previous product</th>
          <td className="driver-hand" colSpan={3}>{previousLoad}</td>
        </tr>
        <tr>
          <th>CMR No</th>
          <td className="driver-hand" colSpan={3}>{safeReceiptValue(record.cmrNo, "")}</td>
        </tr>
        <tr>
          <th>Category</th>
          <td className="driver-hand driver-category" colSpan={3}>{category}</td>
        </tr>
      </tbody></table>

      <div className="driver-slip-band">DRIVER</div>
      <table className="driver-slip-table driver-driver-table"><tbody>
        <tr>
          <th>Name (print)</th>
          <td className="driver-hand">{driver}</td>
        </tr>
        <tr>
          <th>Signature</th>
          <td className="driver-hand driver-signature-line">{signature}</td>
        </tr>
      </tbody></table>

      <div className="driver-slip-band">COMMENTS</div>
      <div className="driver-comments-box">
        <pre>{comments}</pre>
      </div>

      <footer className="driver-slip-footer">
        <span>Issued Jan 2025</span>
        <span>{intent === "pdf" ? "Save as PDF" : "Print"}</span>
      </footer>
    </div>
  );
}


function recordLocationLabel(record: SavedRecord) {
  return record.currentYardLocation || record.location || "Location pending";
}

function loadStoredDraft() {
  try {
    const raw = localStorage.getItem("sets-v41-draft");
    return raw
      ? normalizeDraft(JSON.parse(raw) as Partial<FormState>)
      : normalizeDraft();
  } catch {
    return normalizeDraft();
  }
}

function AppHeader({
  title,
  subtitle,
  onBack,
  onHome,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onHome?: () => void;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D6DEE8] bg-white px-3 py-3 sm:px-4 lg:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#D6DEE8] bg-white text-[#172033] shadow-sm hover:border-[#1F6FEB] sm:h-11 sm:w-11"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex h-10 w-20 shrink-0 items-center justify-center rounded-2xl border border-[#D6DEE8] bg-white px-2 shadow-sm sm:h-12 sm:w-24 sm:px-3">
          <img
            src="./sets-logo.png"
            alt="SETS logo"
            className="max-h-9 max-w-full object-contain"
          />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-black leading-tight text-[#172033] sm:text-xl lg:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="line-clamp-2 text-xs font-semibold leading-5 text-[#64748B] sm:truncate sm:text-sm">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto">
        {right}
        {onHome && (
          <button
            onClick={onHome}
            className="flex h-10 items-center gap-2 rounded-2xl border border-[#D6DEE8] bg-white px-3 text-xs font-black text-[#172033] shadow-sm hover:border-[#1F6FEB] sm:h-11 sm:px-4 sm:text-sm"
          >
            <Home className="h-4 w-4" /> Home
          </button>
        )}
      </div>
    </div>
  );
}

function SectionCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[22px] border border-white/80 bg-white shadow-[0_18px_48px_rgba(11,31,58,0.09)] sm:rounded-[26px] ${className}`}
    >
      {children}
    </div>
  );
}

function SmallLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#64748B]">
      {children}
    </p>
  );
}

function Pill({
  children,
  tone = "neutral",
  onClick,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "dark" | "blue";
  onClick?: () => void;
}) {
  const classes = {
    neutral: "border-[#D6DEE8] bg-[#F8FBFE] text-[#64748B]",
    good: "border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]",
    warn: "border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]",
    danger: "border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]",
    dark: "border-transparent bg-[#0B1F3A] text-white",
    blue: "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]",
  };
  const className = `inline-flex rounded-full border px-3 py-1 text-xs font-black ${classes[tone]} ${onClick ? "cursor-pointer hover:shadow-sm" : ""}`;
  return onClick ? (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ) : (
    <span className={className}>{children}</span>
  );
}

function RecordMetaPills({ record }: { record: SavedRecord }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Pill tone={recordSourceTone(record)}>{recordSourceLabel(record)}</Pill>
      <Pill tone={recordOutputTone(record)}>{recordOutputLabel(record)}</Pill>
    </div>
  );
}

function OutputStatusBanner({ record }: { record: SavedRecord }) {
  const requiredIssues = blockingIssues(getReviewIssues(record, true));
  const final = record.recordState === "Final Saved" && record.isFinal;
  return (
    <div
      className={`rounded-2xl border p-4 text-sm font-bold leading-6 ${final ? "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]" : requiredIssues.length ? "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]" : "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]"}`}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.14em]">
        {recordOutputLabel(record)}
      </p>
      <p className="mt-1">
        {final
          ? "This is marked as a final saved record and can be printed/exported as final."
          : requiredIssues.length
            ? "Mock-up allows draft print/PDF, but live exports should carry a DRAFT / REVIEW NEEDED watermark until the items below are fixed."
            : "Required data is complete. This record can be reviewed and saved as final."}
      </p>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  focused,
  textarea = false,
  rows = 3,
}: {
  label: string;
  name: keyof FormState;
  value: string;
  onChange: (value: string) => void;
  focused?: boolean;
  textarea?: boolean;
  rows?: number;
}) {
  const border = focused
    ? "border-[#F59E0B] ring-2 ring-[#FDE68A]"
    : "border-[#DCE6F0] focus-within:border-[#1F6FEB]";
  return (
    <label
      id={`field-${String(name)}`}
      className={`block rounded-2xl border bg-white p-2 transition ${border}`}
    >
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
        {label}
      </span>
      {textarea ? (
        <textarea
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full resize-none bg-transparent px-2 py-2 text-sm font-semibold text-[#172033] outline-none"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-2 py-2 text-sm font-semibold text-[#172033] outline-none"
        />
      )}
      {focused && (
        <p className="mt-1 rounded-xl bg-[#FFFBEB] px-2 py-1 text-xs font-bold text-[#92400E]">
          Fix this field
        </p>
      )}
    </label>
  );
}

function SelectField({
  label,
  name,
  value,
  options,
  onChange,
  focused,
}: {
  label: string;
  name: keyof FormState;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  focused?: boolean;
}) {
  return (
    <label
      id={`field-${String(name)}`}
      className={`block rounded-2xl border bg-white p-2 transition ${focused ? "border-[#F59E0B] ring-2 ring-[#FDE68A]" : "border-[#DCE6F0]"}`}
    >
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent px-2 py-2 text-sm font-semibold text-[#172033] outline-none"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SignaturePad({
  value,
  onChange,
  focused,
}: {
  value: string;
  onChange: (value: string) => void;
  focused?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };
  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(event.pointerId);
    drawing.current = true;
    const point = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };
  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const point = getPoint(event);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0B1F3A";
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };
  return (
    <div
      id="field-driverSignature"
      className={`rounded-2xl border bg-white p-3 ${focused ? "border-[#F59E0B] ring-2 ring-[#FDE68A]" : "border-[#DCE6F0]"}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">
          Driver signature
        </span>
        {value ? (
          <Pill tone="good">Captured</Pill>
        ) : (
          <Pill tone="warn">Required</Pill>
        )}
      </div>
      <canvas
        ref={canvasRef}
        width={720}
        height={190}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-36 w-full touch-none rounded-xl border border-dashed border-[#94A3B8] bg-[#F8FBFE]"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[#64748B]">
          No default signature is accepted.
        </p>
        <button
          type="button"
          onClick={clear}
          className="rounded-xl border border-[#D6DEE8] bg-white px-3 py-2 text-xs font-black text-[#172033]"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function WorkflowBar({ current }: { current: string }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-[#DCE6F0] bg-white p-2">
      {workflowSteps.map((step) => (
        <div
          key={step}
          className={`rounded-xl px-3 py-2 text-xs font-black ${step === current ? "bg-[#0B1F3A] text-white" : "bg-[#F8FBFE] text-[#64748B]"}`}
        >
          {step}
        </div>
      ))}
    </div>
  );
}

type DashboardNavScreen =
  | "dashboard"
  | "yardStatus"
  | "throughput"
  | "recentRecords"
  | "records"
  | "reviewNeeded"
  | "dataSeparation";

type CompactTankRow = {
  tankNo: string;
  customer: string;
  product: string;
  service: string;
  status: string;
  location: string;
  arrival: string;
  timeOnSite: string;
  dataQuality: string;
};

const compactTankRows: CompactTankRow[] = [
  {
    tankNo: "T-5248",
    customer: "Global Fuels Ltd",
    product: "Gasoil",
    service: "Wash",
    status: "IN PROGRESS",
    location: "Yard A - Bay 3",
    arrival: "09:15",
    timeOnSite: "1h 25m",
    dataQuality: "GOOD",
  },
  {
    tankNo: "T-5271",
    customer: "Apex Energy",
    product: "Jet A1",
    service: "Wash",
    status: "WAITING WASH",
    location: "Yard A - Bay 1",
    arrival: "08:40 AM",
    timeOnSite: "0h 35m",
    dataQuality: "GOOD",
  },
  {
    tankNo: "T-5211",
    customer: "North Star Fuels",
    product: "Gasoil",
    service: "Heat",
    status: "HEATING",
    location: "Heating Bay 2",
    arrival: "08:10 AM",
    timeOnSite: "1h 10m",
    dataQuality: "GOOD",
  },
  {
    tankNo: "T-5155",
    customer: "Blue Ocean Ltd",
    product: "Biodiesel",
    service: "Store",
    status: "STORAGE",
    location: "Storage Tank Farm",
    arrival: "Yesterday",
    timeOnSite: "14h 20m",
    dataQuality: "GOOD",
  },
  {
    tankNo: "T-5077",
    customer: "Sunrise Fuels",
    product: "Gasoil",
    service: "Wash",
    status: "READY",
    location: "Yard B - Bay 5",
    arrival: "Yesterday",
    timeOnSite: "--",
    dataQuality: "GOOD",
  },
];

function compactStatusClasses(status: string) {
  const map: Record<string, string> = {
    "IN PROGRESS": "bg-[#DCFCE7] text-[#166534]",
    "WAITING WASH": "bg-[#FEF3C7] text-[#92400E]",
    HEATING: "bg-[#FFEDD5] text-[#C2410C]",
    STORAGE: "bg-[#EDE9FE] text-[#5B21B6]",
    READY: "bg-[#DCFCE7] text-[#15803D]",
  };
  return map[status] || "bg-[#F1F5F9] text-[#334155]";
}

function CompactTankRecordsTable({ title, rows }: { title: string; rows: CompactTankRow[] }) {
  return (
    <div className="rounded-2xl border border-[#E5EAF1] bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-black tracking-tight text-[#0F172A]">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-[#E8EEF6] text-[10px] font-black text-[#0F172A]">
              <th className="px-2 py-2">Tank No</th>
              <th className="px-2 py-2">Customer</th>
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2">Service</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Location</th>
              <th className="px-2 py-2">Arrival</th>
              <th className="px-2 py-2">Time on Site</th>
              <th className="px-2 py-2">Data Quality</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tankNo} className="border-b border-[#EEF2F7] font-semibold text-[#0F172A] last:border-b-0">
                <td className="px-2 py-2 font-black text-[#2563EB]">{row.tankNo}</td>
                <td className="px-2 py-2">{row.customer}</td>
                <td className="px-2 py-2">{row.product}</td>
                <td className="px-2 py-2">{row.service}</td>
                <td className="px-2 py-2">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-black ${compactStatusClasses(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-2 py-2">{row.location}</td>
                <td className="px-2 py-2">{row.arrival}</td>
                <td className="px-2 py-2">{row.timeOnSite}</td>
                <td className="px-2 py-2">
                  <span className="inline-flex rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[9px] font-black text-[#15803D]">
                    {row.dataQuality}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BackToDashboardButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-2xl border border-[#D6DEE8] bg-white px-4 py-2 text-xs font-black text-[#172033] shadow-sm hover:border-[#1F6FEB]"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Dashboard
    </button>
  );
}

function SidebarButton({
  icon,
  label,
  description,
  badge,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  badge?: string | number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={description ? `${label} — ${description}` : label}
      aria-current={active ? "page" : undefined}
      className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
        active
          ? "border-white/25 bg-[#1F6FEB] text-white shadow-lg shadow-[#1F6FEB]/20"
          : "border-transparent text-white/78 hover:border-white/10 hover:bg-white/10 hover:text-white"
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          active ? "bg-white/20" : "bg-white/10 group-hover:bg-white/15"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-black leading-tight">
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block truncate text-[10px] font-bold leading-tight text-white/55 group-hover:text-white/70">
            {description}
          </span>
        )}
      </span>
      {badge !== undefined && badge !== "" && (
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${
            active ? "bg-white text-[#1F6FEB]" : "bg-white/10 text-white/75"
          }`}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function DashboardSidebar({
  active,
  demoMode,
  shownCount,
  reviewCount,
  onHome,
  onNewIntake,
  onNavigate,
  onReviewNeeded,
}: {
  active: DashboardNavScreen;
  demoMode: boolean;
  shownCount: number;
  reviewCount: number;
  onHome: () => void;
  onNewIntake: () => void;
  onNavigate: (screen: DashboardNavScreen) => void;
  onReviewNeeded: () => void;
}) {
  return (
    <aside className="dashboard-sidebar flex min-h-0 flex-col bg-[#082446] px-3 py-4 text-white">
      <div className="mb-4 rounded-[24px] border border-white/10 bg-white/10 p-3 shadow-inner shadow-white/5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white p-1.5">
            <img
              src="./sets-logo.png"
              alt="SETS"
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/55">
              SETS
            </p>
            <p className="text-sm font-black leading-tight">Yard Control</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-white/10 p-2">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/45">
              Mode
            </p>
            <p className="mt-1 text-xs font-black">
              {demoMode ? "Demo" : "Live"}
            </p>
          </div>
          <div className="rounded-2xl bg-white/10 p-2">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-white/45">
              Shown
            </p>
            <p className="mt-1 text-xs font-black">{shownCount}</p>
          </div>
        </div>
      </div>

      <div className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
        Workflow
      </div>
      <div className="space-y-2">
        <SidebarButton
          icon={<Home className="h-5 w-5" />}
          label="Home"
          description="Main menu"
          onClick={onHome}
        />
        <SidebarButton
          icon={<ClipboardPen className="h-5 w-5" />}
          label="New / Existing Intake"
          description="Start or continue"
          onClick={onNewIntake}
        />
      </div>

      <div className="mb-2 mt-5 px-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
        Management pages
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        <SidebarButton
          icon={<BarChart3 className="h-5 w-5" />}
          label="Dashboard Overview"
          description="KPIs and charts"
          active={active === "dashboard"}
          onClick={() => onNavigate("dashboard")}
        />
        <SidebarButton
          icon={<FileText className="h-5 w-5" />}
          label="Yard Status"
          description="Manager table"
          active={active === "yardStatus"}
          onClick={() => onNavigate("yardStatus")}
        />
        <SidebarButton
          icon={<BarChart3 className="h-5 w-5" />}
          label="Throughput Details"
          description="7-day movements"
          active={active === "throughput"}
          onClick={() => onNavigate("throughput")}
        />
        <SidebarButton
          icon={<Printer className="h-5 w-5" />}
          label="Saved Records / Print"
          description="Drafts, print and PDF"
          active={active === "records"}
          onClick={() => onNavigate("records")}
        />
        <SidebarButton
          icon={<ShieldAlert className="h-5 w-5" />}
          label="Review Needed"
          description="Fix missing data"
          badge={reviewCount || undefined}
          active={active === "reviewNeeded"}
          onClick={onReviewNeeded}
        />
      </div>

      <div className="mt-4 rounded-[22px] border border-white/10 bg-white/10 p-3 text-[11px] font-bold leading-5 text-white/60">
        <p className="font-black text-white/80">Details stay here</p>
        <p>
          Main mock-up view is kept simple. Extra admin logic remains in code for the real app phase.
        </p>
      </div>
    </aside>
  );
}

function issueScreenLabel(screen: Screen) {
  if (screen === "driver") return "Driver Confirmation";
  if (screen === "supervisor") return "Tank Intake & Service Data";
  if (screen === "validation") return "Validation";
  if (screen === "finalReview") return "Final Review";
  return screen;
}

function issueTabLabel(tab: FormTab) {
  if (tab === "intake") return "Intake tab";
  if (tab === "service") return "Service Data tab";
  return "Attachments / Notes tab";
}

function issueFieldLabel(field: keyof FormState) {
  const labels: Partial<Record<keyof FormState, string>> = {
    tankNo: "Tank No.",
    expectedTankNo: "Expected Tank No.",
    customer: "Customer",
    company: "Company",
    orderNo: "Order No.",
    receiptNo: "Receipt / Ref No.",
    customerRef: "Customer Ref",
    vehicleRegNo: "Vehicle Reg No.",
    opsName: "Operator / Supervisor",
    previousProduct: "Actual Previous Product",
    lastProduct: "Last Product",
    category: "Category",
    procedure: "Procedure",
    cleanDirty: "Clean / Dirty",
    heatingHours: "Heating Hours",
    targetTemperature: "Target Temperature",
    timeIn: "Time In",
    timeOut: "Time Out",
    currentYardLocation: "Yard Location",
    storageStartDate: "Storage Start Date",
    driverName: "Driver Name",
    driverCompany: "Driver Company",
    driverSignature: "Driver Signature",
    attachmentNotes: "Attachment Notes",
    photoNotes: "Photo Notes",
  };
  return labels[field] || String(field);
}

function issueRouteLabel(issue: ReviewIssue) {
  return `${issueScreenLabel(issue.screen)} → ${issueTabLabel(issue.tab)} → ${issueFieldLabel(issue.field)}`;
}

function firstIssueForRecord(record: SavedRecord) {
  const issues = getReviewIssues(record, true);
  return blockingIssues(issues)[0] || issues[0] || null;
}

function IssueSeverityPill({ severity }: { severity: ReviewIssue["severity"] }) {
  if (severity === "required") return <Pill tone="warn">Required</Pill>;
  if (severity === "future") return <Pill tone="blue">Next phase</Pill>;
  return <Pill tone="neutral">Advisory</Pill>;
}

function IssuesList({
  issues,
  onFix,
  emptyText = "No review items.",
}: {
  issues: ReviewIssue[];
  onFix: (issue: ReviewIssue) => void;
  emptyText?: string;
}) {
  if (!issues.length)
    return (
      <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-sm font-bold text-[#15803D]">
        {emptyText}
      </div>
    );
  return (
    <div className="space-y-3">
      {issues.map((item) => (
        <button
          key={item.id}
          onClick={() => onFix(item)}
          className={`w-full rounded-2xl border p-4 text-left transition hover:shadow-sm ${item.severity === "required" ? "border-[#FDE68A] bg-[#FFFBEB] hover:border-[#F59E0B]" : "border-[#D6DEE8] bg-white hover:border-[#94A3B8]"}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-black text-[#172033]">{item.label}</p>
                <IssueSeverityPill severity={item.severity} />
              </div>
              <p className="mt-1 text-xs font-semibold leading-5 text-[#64748B]">
                {item.message}
              </p>
              <div className="mt-2 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[11px] font-black uppercase tracking-[0.11em] text-[#475569]">
                Opens: {issueRouteLabel(item)}
              </div>
            </div>
            <span className="shrink-0 rounded-xl bg-[#0B1F3A] px-3 py-2 text-xs font-black text-white">
              Fix now
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}

function FixModeBanner({
  issue,
  stillOpen,
  recordLabel,
  onBackReview,
  onClear,
}: {
  issue: ReviewIssue | null;
  stillOpen: boolean;
  recordLabel: string;
  onBackReview: () => void;
  onClear: () => void;
}) {
  if (!issue) return null;
  return (
    <div className={`rounded-[24px] border p-4 shadow-sm ${stillOpen ? "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]" : "border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em]">Review fix mode</p>
          <h3 className="mt-1 text-xl font-black">{issue.label}</h3>
          <p className="mt-1 text-sm font-bold leading-6">{issue.message}</p>
          <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-black uppercase tracking-[0.12em]">
            Record: {recordLabel || "Current draft"} • Target: {issueRouteLabel(issue)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={stillOpen ? "warn" : "good"}>{stillOpen ? "Still needs fixing" : "Looks fixed in current draft"}</Pill>
          <button
            type="button"
            onClick={onBackReview}
            className="rounded-xl bg-[#0B1F3A] px-3 py-2 text-xs font-black text-white"
          >
            Back to Review Needed
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-current/30 bg-white/70 px-3 py-2 text-xs font-black"
          >
            Clear highlight
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [splashLeaving, setSplashLeaving] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [formTab, setFormTab] = useState<FormTab>("intake");
  const [draft, setDraft] = useState<FormState>(() => loadStoredDraft());
  const [savedRecords, setSavedRecords] = useState<SavedRecord[]>(() =>
    loadStoredRecords(),
  );
  const [lastSavedRecord, setLastSavedRecord] = useState<SavedRecord>(
    () => loadStoredRecords()[0] || makeRecord(defaultDraft),
  );
  const [quickLookup, setQuickLookup] = useState("");
  const [lookupMessage, setLookupMessage] = useState(
    "Enter or paste one strong identifier, then press Pull details. Tank No. and Product will be loaded after a match for the operator to confirm.",
  );
  const [lookupMatches, setLookupMatches] = useState<
    Array<{ entry: FormState; matchedBy: string; matchedValue: string }>
  >([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<keyof FormState | null>(null);
  const [dashboardSearch, setDashboardSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState<ServiceType | "All">(
    "All",
  );
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [demoMode, setDemoMode] = useState(true);
  const [duplicateOverride, setDuplicateOverride] = useState(false);
  const [exportIntent, setExportIntent] = useState<OutputIntent>("print");
  const [receiptKind, setReceiptKind] = useState<ReceiptKind>("sets");
  const [activeFixIssue, setActiveFixIssue] = useState<ReviewIssue | null>(null);
  const [activeFixRecordLabel, setActiveFixRecordLabel] = useState("");

  useEffect(() => {
    const leaveTimer = window.setTimeout(() => setSplashLeaving(true), 900);
    const hideTimer = window.setTimeout(() => setShowSplash(false), 1350);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("sets-v41-records", JSON.stringify(savedRecords));
  }, [savedRecords]);

  useEffect(() => {
    localStorage.setItem("sets-v41-draft", JSON.stringify(draft));
  }, [draft]);

  useEffect(() => {
    if (focusField) {
      window.setTimeout(() => {
        const target = document.getElementById(`field-${String(focusField)}`);
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.classList.add("review-field-pulse");
        const input = target?.querySelector("input, textarea, select, canvas") as HTMLElement | null;
        input?.focus?.();
        window.setTimeout(() => target?.classList.remove("review-field-pulse"), 2200);
      }, 120);
    }
  }, [focusField, screen, formTab]);

  const updateDraft = <K extends keyof FormState>(
    key: K,
    value: FormState[K],
  ) => {
    let nextValue = value;
    if (key === "vehicleRegNo") {
      nextValue = value
        .toString()
        .toUpperCase()
        .replace(/\s+/g, " ") as FormState[K];
    }
    // Do not run full normalisation while typing.
    // Earlier versions cleared Vehicle Reg / Operator fields while the user was still typing
    // because partial values looked invalid. Validation now flags bad data without blocking input.
    setDraft((prev) => ({ ...prev, [key]: nextValue }));
  };

  const allIssues = useMemo(() => getReviewIssues(draft, true), [draft]);
  const allRequiredIssues = useMemo(
    () => blockingIssues(allIssues),
    [allIssues],
  );
  const allQualityWarnings = useMemo(
    () => qualityWarnings(allIssues),
    [allIssues],
  );
  const activeFixStillOpen = useMemo(
    () => activeFixIssue ? getReviewIssues(draft, true).some((item) => item.id === activeFixIssue.id) : false,
    [activeFixIssue, draft],
  );
  const preDriverIssues = useMemo(() => getReviewIssues(draft, false), [draft]);
  const preDriverRequiredIssues = useMemo(
    () => blockingIssues(preDriverIssues),
    [preDriverIssues],
  );
  const driverIssues = useMemo(
    () => allIssues.filter((item) => item.group === "Driver Confirmation"),
    [allIssues],
  );
  const driverRequiredIssues = useMemo(
    () => blockingIssues(driverIssues),
    [driverIssues],
  );
  const draftPreview = useMemo(
    () => makeRecord(draft, activeRecordId || "active-draft", false),
    [draft, activeRecordId],
  );
  const hasStartedDraft = Boolean(
    draft.tankNo.trim() ||
    draft.customer.trim() ||
    draft.company.trim() ||
    draft.orderNo.trim() ||
    draft.receiptNo.trim(),
  );

  const duplicateRecord = useMemo(() => {
    const tank = compact(draft.tankNo);
    if (!tank) return undefined;
    return savedRecords.find(
      (record) =>
        record.id !== activeRecordId &&
        compact(record.tankNo) === tank &&
        record.recordState !== "Departed",
    );
  }, [draft.tankNo, savedRecords, activeRecordId]);

  const upsertRecord = (record: SavedRecord) => {
    setSavedRecords((prev) => [
      record,
      ...prev.filter((item) => item.id !== record.id),
    ]);
    setLastSavedRecord(record);
  };

  const startNewIntake = () => {
    setDraft(
      normalizeDraft({
        intakeDate: getTodayUkDate(),
        storageStartDate: getTodayUkDate(),
      }),
    );
    setActiveRecordId(null);
    setFocusField(null);
    setActiveFixIssue(null);
    setActiveFixRecordLabel("");
    setDuplicateOverride(false);
    setFormTab("intake");
    setScreen("service");
  };

  const storeIncomplete = () => {
    const id = activeRecordId || `draft-${Date.now()}`;
    const record = makeRecord(draft, id, false);
    upsertRecord(record);
    setActiveRecordId(id);
    setScreen("records");
  };

  const applyPrebookedMatch = (
    entry: FormState,
    matchedBy: string,
    matchedValue: string,
  ) => {
    const expectedProduct =
      entry.expectedProduct ||
      entry.previousProduct ||
      entry.lastProduct ||
      entry.natureOfProduct ||
      "";
    const clean = normalizeDraft({
      ...entry,
      expectedTankNo: entry.expectedTankNo || entry.tankNo,
      expectedProduct,
      matchedBy,
      matchedValue,
      driverName: "",
      driverCompany: "",
      driverSignature: "",
      vehicleRegNo: (entry.vehicleRegNo || "").toUpperCase(),
    });
    setDraft(clean);
    setActiveRecordId(null);
    setLookupMatches([]);
    setFormTab("intake");
    setScreen("supervisor");
    setLookupMessage(
      `Pre-booked details loaded. Matched by ${matchedBy}: ${matchedValue}. Expected tank/product are shown separately and can be confirmed or edited.`,
    );
  };

  const findPrebooked = () => {
    const search = compact(quickLookup);
    if (!search) {
      setLookupMessage(
        "Use a strong lookup key: Vehicle Reg, Order No., Receipt No., Customer Ref, ECD No. or Serial No. Do not search by Tank No. or Product.",
      );
      return;
    }

    const blockedReason = blockedLookupReason(quickLookup, prebookedEntries);
    if (blockedReason) {
      setLookupMessage(blockedReason);
      return;
    }

    const lookupLabels: Array<[keyof FormState, string]> = [
      ["vehicleRegNo", "Vehicle Reg"],
      ["orderNo", "Order No."],
      ["receiptNo", "Receipt No."],
      ["customerRef", "Customer Ref"],
      ["ecdNo", "ECD No."],
      ["serialNo", "Serial No."],
    ];
    const matches = prebookedEntries.flatMap((entry) => {
      const match = lookupLabels.find(([key]) => {
        const value = entry[key];
        return (
          typeof value === "string" &&
          value.trim().length >= 3 &&
          !isBadPlaceholder(value) &&
          compact(value) === search
        );
      });
      return match
        ? [
            {
              entry,
              matchedBy: match[1],
              matchedValue: String(entry[match[0]]),
            },
          ]
        : [];
    });
    if (!matches.length) {
      setLookupMessage(
        "No pre-booked match found. Try a strong identifier such as GN22YND, 3667214, 163738, 3629174 or 4660549. Tank No. and Product are intentionally not searchable.",
      );
      return;
    }
    if (matches.length > 1) {
      setLookupMatches(matches);
      setLookupMessage(
        `${matches.length} possible pre-booked jobs found. Select the correct job to continue.`,
      );
      setScreen("lookupSelect");
      return;
    }
    applyPrebookedMatch(
      matches[0].entry,
      matches[0].matchedBy,
      matches[0].matchedValue,
    );
  };

  const openFixIssue = (item: ReviewIssue, record?: SavedRecord) => {
    if (record) {
      setDraft(normalizeDraft(record));
      setActiveRecordId(record.id);
      setLastSavedRecord(record);
      setActiveFixRecordLabel(record.tankNo || record.expectedTankNo || record.customer || "Draft record");
    } else {
      setActiveFixRecordLabel(draft.tankNo || draft.expectedTankNo || draft.customer || "Current draft");
    }
    setActiveFixIssue(item);
    setFocusField(item.field);
    setFormTab(item.tab);
    setScreen(item.screen);
  };

  const continueToDriver = () => {
    const id = activeRecordId || `draft-${Date.now()}`;
    const record = makeRecord(draft, id, false);
    upsertRecord(record);
    setActiveRecordId(id);
    setScreen("driver");
  };

  const continueToFinalReview = () => {
    const id = activeRecordId || `draft-${Date.now()}`;
    const record = makeRecord(draft, id, false);
    upsertRecord(record);
    setActiveRecordId(id);
    setScreen("finalReview");
  };

  const saveFinalRecord = () => {
    const finalIssues = blockingIssues(getReviewIssues(draft, true));
    if (finalIssues.length || (duplicateRecord && !duplicateOverride)) return;
    const record = makeRecord(
      { ...draft, statusStage: draft.statusStage || getDefaultStatus(draft) },
      activeRecordId || `rec-${Date.now()}`,
      true,
    );
    upsertRecord(record);
    setActiveRecordId(record.id);
    setDuplicateOverride(false);
    setScreen("record");
  };

  const openRecord = (record: SavedRecord) => {
    setLastSavedRecord(record);
    setDraft(normalizeDraft(record));
    setActiveRecordId(record.id);
    setScreen("record");
  };

  const recordsBase = useMemo(
    () =>
      demoMode
        ? mergeRecords(savedRecords, seedRecords)
        : savedRecords.filter((record) => !record.id.startsWith("seed-")),
    [demoMode, savedRecords],
  );
  const dashboardRecords = useMemo(() => {
    const active =
      hasStartedDraft &&
      !recordsBase.some((record) => record.id === activeRecordId)
        ? [draftPreview]
        : [];
    const source = [...active, ...recordsBase];
    const search = compact(dashboardSearch);
    return source.filter((record) => {
      const matchesSearch =
        !search ||
        [
          record.tankNo,
          record.customer,
          record.company,
          record.orderNo,
          record.receiptNo,
          record.vehicleRegNo,
        ].some((value) => compact(value).includes(search));
      const matchesService =
        serviceFilter === "All" || record.serviceType === serviceFilter;
      const matchesStatus =
        statusFilter === "All" ||
        record.status === statusFilter ||
        record.recordState === statusFilter;
      const matchesReview =
        !needsReviewOnly ||
        record.dataQuality === "Review" ||
        record.recordState === "Review Needed";
      return matchesSearch && matchesService && matchesStatus && matchesReview;
    });
  }, [
    recordsBase,
    hasStartedDraft,
    activeRecordId,
    draftPreview,
    dashboardSearch,
    serviceFilter,
    statusFilter,
    needsReviewOnly,
  ]);

  const cleanRecords = dashboardRecords.filter(
    (record) => record.isFinal && record.dataQuality === "Good",
  );
  const incompleteRecords = dashboardRecords.filter(
    (record) => !record.isFinal || record.dataQuality === "Review",
  );
  const needsAttentionRecords = dashboardRecords.filter(
    (record) =>
      record.dataQuality === "Review" || record.recordState === "Review Needed",
  );
  const recentTankRecords = useMemo(() => {
    const active =
      hasStartedDraft &&
      !recordsBase.some((record) => record.id === activeRecordId)
        ? [draftPreview]
        : [];
    const search = compact(dashboardSearch);
    const source = [...active, ...recordsBase];

    return source
      .filter((record) => {
        const matchesSearch =
          !search ||
          [
            record.tankNo,
            record.customer,
            record.company,
            record.orderNo,
            record.receiptNo,
            record.customerRef,
            record.vehicleRegNo,
            record.previousProduct,
            record.lastProduct,
            record.currentYardLocation,
          ].some((value) => compact(value).includes(search));
        const matchesService =
          serviceFilter === "All" || record.serviceType === serviceFilter;
        const matchesStatus =
          statusFilter === "All" ||
          record.status === statusFilter ||
          record.recordState === statusFilter;
        return matchesSearch && matchesService && matchesStatus;
      })
      .sort((a, b) => {
        const aDemo = isDemoRecord(a) ? 0 : 1;
        const bDemo = isDemoRecord(b) ? 0 : 1;
        if (aDemo !== bDemo) return bDemo - aDemo;
        return (b.updatedAt || b.createdLabel).localeCompare(
          a.updatedAt || a.createdLabel,
        );
      });
  }, [
    recordsBase,
    hasStartedDraft,
    activeRecordId,
    draftPreview,
    dashboardSearch,
    serviceFilter,
    statusFilter,
  ]);

  const libraryRecords = recentTankRecords.filter(
    (record) =>
      !needsReviewOnly ||
      record.dataQuality === "Review" ||
      record.recordState === "Review Needed",
  );

  const librarySections = [
    {
      key: "draft",
      title: "Draft / Incomplete",
      subtitle: "Started records that still need normal intake, service or driver information.",
      tone: "neutral" as const,
      records: libraryRecords.filter(
        (record) =>
          record.recordState === "Draft" ||
          (!record.isFinal &&
            ![
              "Review Needed",
              "Ready for Driver",
              "Driver Confirmed",
              "Ready to Print",
              "Final Saved",
            ].includes(record.recordState)),
      ),
    },
    {
      key: "review",
      title: "Review Needed",
      subtitle: "Records with missing or questionable data. Fix links take the user back to the right stage.",
      tone: "warn" as const,
      records: libraryRecords.filter(
        (record) =>
          record.dataQuality === "Review" || record.recordState === "Review Needed",
      ),
    },
    {
      key: "readyDriver",
      title: "Ready for Driver",
      subtitle: "Intake and service data is ready, but driver confirmation is still pending.",
      tone: "blue" as const,
      records: libraryRecords.filter(
        (record) => record.recordState === "Ready for Driver",
      ),
    },
    {
      key: "driverConfirmed",
      title: "Driver Confirmed",
      subtitle: "Driver details and signature are captured. These can move to final review.",
      tone: "blue" as const,
      records: libraryRecords.filter(
        (record) => record.recordState === "Driver Confirmed",
      ),
    },
    {
      key: "readyPrint",
      title: "Ready to Print",
      subtitle: "Required data is complete. These can be printed or saved as ready records.",
      tone: "dark" as const,
      records: libraryRecords.filter(
        (record) =>
          recordOutputLabel(record) === "READY TO PRINT" &&
          !(record.recordState === "Final Saved" && record.isFinal),
      ),
    },
    {
      key: "final",
      title: "Final Saved",
      subtitle: "Final records that can be printed or exported without a draft warning.",
      tone: "good" as const,
      records: libraryRecords.filter(
        (record) => record.recordState === "Final Saved" && record.isFinal,
      ),
    },
  ];

  const librarySummary = {
    shown: libraryRecords.length,
    draft: librarySections[0].records.length,
    review: librarySections[1].records.length,
    readyDriver: librarySections[2].records.length,
    driverConfirmed: librarySections[3].records.length,
    readyPrint: librarySections[4].records.length,
    final: librarySections[5].records.length,
  };

  const demoVisibleRecords = dashboardRecords.filter((record) =>
    isDemoRecord(record),
  );
  const liveVisibleRecords = dashboardRecords.filter(
    (record) => !isDemoRecord(record),
  );
  const liveDraftRecords = liveVisibleRecords.filter(
    (record) => !record.isFinal && record.recordState !== "Final Saved",
  );
  const reviewVisibleRecords = dashboardRecords.filter(
    (record) =>
      record.dataQuality === "Review" ||
      record.recordState === "Review Needed" ||
      blockingIssues(getReviewIssues(record, true)).length > 0,
  );
  const liveFinalRecords = liveVisibleRecords.filter(
    (record) => record.isFinal && record.recordState === "Final Saved",
  );
  const readyToPrintRecords = dashboardRecords.filter(
    (record) => recordOutputLabel(record) === "READY TO PRINT",
  );

  const dataSeparationGroups = [
    {
      key: "demo",
      title: "Demo sample records",
      subtitle: "Presentation-only records used to show a crowded running SETS yard.",
      tone: "blue" as const,
      records: demoVisibleRecords,
      action: () => setDemoMode(true),
    },
    {
      key: "live",
      title: "Live user-created records",
      subtitle: "Records created or saved in this browser during the mock-up session.",
      tone: "neutral" as const,
      records: liveVisibleRecords,
      action: () => setScreen("records"),
    },
    {
      key: "draft",
      title: "Live draft / incomplete",
      subtitle: "Started records that should not be treated as final site data.",
      tone: "warn" as const,
      records: liveDraftRecords,
      action: () => setScreen("records"),
    },
    {
      key: "review",
      title: "Review needed",
      subtitle: "Records with missing required fields, advisory warnings or data-quality concerns.",
      tone: "danger" as const,
      records: reviewVisibleRecords,
      action: () => {
        setNeedsReviewOnly(true);
        setStatusFilter("All");
        setScreen("reviewNeeded");
      },
    },
    {
      key: "ready",
      title: "Ready to print",
      subtitle: "Records complete enough for ready/draft output but not final-saved unless approved.",
      tone: "blue" as const,
      records: readyToPrintRecords,
      action: () => setScreen("records"),
    },
    {
      key: "final",
      title: "Final saved records",
      subtitle: "Clean final records suitable for final print/export labelling.",
      tone: "good" as const,
      records: liveFinalRecords,
      action: () => setScreen("records"),
    },
  ];

  const waitingWashRecords = dashboardRecords.filter(
    (record) =>
      record.status === "Waiting for Wash" ||
      record.currentYardLocation.toLowerCase().includes("wash"),
  );
  const heatingRecords = dashboardRecords.filter(
    (record) =>
      record.status === "Waiting for Heating" ||
      record.currentYardLocation.toLowerCase().includes("heating"),
  );
  const storageRecords = dashboardRecords.filter(
    (record) =>
      record.status === "In Storage" ||
      record.currentYardLocation.toLowerCase().includes("storage"),
  );
  const readyRecords = dashboardRecords.filter(
    (record) =>
      record.status === "Complete" ||
      record.status === "Ready for Collection" ||
      record.recordState === "Final Saved",
  );
  const intakeRecords = dashboardRecords.filter(
    (record) =>
      record.status === "Arrived" ||
      record.status === "Booked" ||
      record.currentYardLocation.toLowerCase().includes("intake"),
  );

  const kpis = {
    onSite: dashboardRecords.length,
    waitingWash: waitingWashRecords.length,
    heating: heatingRecords.length,
    storage: storageRecords.length,
    ready: readyRecords.length,
    clean: cleanRecords.length,
    incomplete: incompleteRecords.length,
    review: needsAttentionRecords.length,
    readyForDriver: dashboardRecords.filter(
      (record) => record.recordState === "Ready for Driver",
    ).length,
    departed: dashboardRecords.filter(
      (record) => record.recordState === "Departed",
    ).length,
  };

  const statusSplit = [
    { name: "Intake", value: intakeRecords.length, color: "#1F6FEB" },
    {
      name: "Waiting Wash",
      value: waitingWashRecords.length,
      color: "#F59E0B",
    },
    { name: "Heating", value: heatingRecords.length, color: "#F97316" },
    { name: "Storage", value: storageRecords.length, color: "#8B5CF6" },
    { name: "Ready", value: readyRecords.length, color: "#22C55E" },
    { name: "Data Issues", value: kpis.review, color: "#EF4444" },
  ].filter((item) => item.value > 0);

  const dashboardKpis = demoMode
    ? {
        onSite: 68,
        waitingWash: 14,
        heating: 9,
        storage: 22,
        ready: 18,
        review: 2,
      }
    : kpis;

  const dashboardStatusTotal = demoMode ? 68 : Math.max(kpis.onSite, 1);

  const dashboardStatusSplit = demoMode
    ? [
        { name: "Intake", value: 4, color: "#1F6FEB" },
        { name: "Waiting Wash", value: 14, color: "#F6C400" },
        { name: "Heating", value: 9, color: "#F97316" },
        { name: "Storage", value: 22, color: "#7C6ADE" },
        { name: "Ready", value: 18, color: "#58B348" },
        { name: "Data Issues", value: 2, color: "#FF2B35" },
      ]
    : statusSplit;

  const dashboardThroughputData = demoMode
    ? [
        { day: "May 14", count: 58 },
        { day: "May 15", count: 62 },
        { day: "May 16", count: 66 },
        { day: "May 17", count: 70 },
        { day: "May 18", count: 90 },
        { day: "May 19", count: 82 },
        { day: "May 20", count: 70 },
      ]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => {
        const washing = Math.max(0, Math.round((waitingWashRecords.length * (index + 2)) / 7));
        const heating = Math.max(0, Math.round((heatingRecords.length * (index + 3)) / 7));
        const storage = Math.max(0, Math.round((storageRecords.length * (index + 4)) / 7));
        return { day, count: washing + heating + storage };
      });

  const throughputData = useMemo(() => {
    if (demoMode) {
      return [
        { day: "May 14", count: 54, washing: 18, heating: 9, storage: 27, intake: 6, ready: 11 },
        { day: "May 15", count: 63, washing: 21, heating: 12, storage: 30, intake: 8, ready: 14 },
        { day: "May 16", count: 68, washing: 24, heating: 13, storage: 31, intake: 9, ready: 16 },
        { day: "May 17", count: 72, washing: 25, heating: 14, storage: 33, intake: 7, ready: 18 },
        { day: "May 18", count: 91, washing: 31, heating: 19, storage: 41, intake: 11, ready: 23 },
        { day: "May 19", count: 84, washing: 28, heating: 17, storage: 39, intake: 10, ready: 20 },
        { day: "May 20", count: 74, washing: 24, heating: 15, storage: 35, intake: 8, ready: 17 },
      ];
    }
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return labels.map((day, index) => {
      const washing = Math.max(0, Math.round((waitingWashRecords.length * (index + 2)) / 7));
      const heating = Math.max(0, Math.round((heatingRecords.length * (index + 3)) / 7));
      const storage = Math.max(0, Math.round((storageRecords.length * (index + 4)) / 7));
      const intake = Math.max(0, Math.round((intakeRecords.length * (index + 2)) / 8));
      const ready = Math.max(0, Math.round((readyRecords.length * (index + 3)) / 8));
      return {
        day,
        washing,
        heating,
        storage,
        intake,
        ready,
        count: washing + heating + storage,
      };
    });
  }, [
    demoMode,
    waitingWashRecords.length,
    heatingRecords.length,
    storageRecords.length,
    intakeRecords.length,
    readyRecords.length,
  ]);

  const throughputSummary = useMemo(() => {
    const total = throughputData.reduce((sum, item) => sum + item.count, 0);
    const washing = throughputData.reduce((sum, item) => sum + item.washing, 0);
    const heating = throughputData.reduce((sum, item) => sum + item.heating, 0);
    const storage = throughputData.reduce((sum, item) => sum + item.storage, 0);
    const intake = throughputData.reduce((sum, item) => sum + item.intake, 0);
    const ready = throughputData.reduce((sum, item) => sum + item.ready, 0);
    const peak = throughputData.reduce(
      (best, item) => (item.count > best.count ? item : best),
      throughputData[0] || { day: "—", count: 0, washing: 0, heating: 0, storage: 0, intake: 0, ready: 0 },
    );
    const services = [
      { name: "Washing", value: washing, color: "#1F6FEB" },
      { name: "Heating", value: heating, color: "#F97316" },
      { name: "Storage", value: storage, color: "#8B5CF6" },
    ];
    const busiest = services.reduce(
      (best, item) => (item.value > best.value ? item : best),
      services[0],
    );
    return {
      total,
      washing,
      heating,
      storage,
      intake,
      ready,
      average: Math.round(total / Math.max(throughputData.length, 1)),
      peak,
      services,
      busiest,
    };
  }, [throughputData]);

  const draftPreviewRecord = useMemo(
    () => makeRecord(draft, activeRecordId || "draft-preview", false),
    [activeRecordId, draft],
  );

  const printRecord = (record?: SavedRecord, intent: OutputIntent = "print", kind: ReceiptKind = "sets") => {
    const target = record || draftPreviewRecord;
    setExportIntent(intent);
    setReceiptKind(kind);
    setLastSavedRecord(target);
    document.title = `${outputFileName(target, intent)}-${kind === "sets" ? "SETS-RECEIPT" : "DRIVER-RECEIPT"}`;
    window.setTimeout(() => window.print(), 120);
  };

  const editRecord = (record: SavedRecord, targetTab: FormTab = "intake") => {
    setDraft(normalizeDraft(record));
    setActiveRecordId(record.id);
    setFormTab(targetTab);
    setScreen("supervisor");
  };

  if (showSplash) {
    return (
      <div
        className={`relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B1F3A] px-6 transition-opacity duration-700 ${splashLeaving ? "opacity-0" : "opacity-100"}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(31,111,235,0.32),_transparent_30%)]" />
        <div className="splash-ring absolute h-[34rem] w-[34rem] rounded-full border border-white/10" />
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="splash-card mb-8 flex h-44 w-72 items-center justify-center rounded-[2.5rem] bg-white px-8 shadow-[0_30px_80px_rgba(0,0,0,0.28)]">
            <img
              src="./sets-logo.png"
              alt="SETS logo"
              className="max-h-28 max-w-full object-contain"
            />
          </div>
          <p className="text-sm font-black uppercase tracking-[0.36em] text-white/65">
            South Eastern Tanker Services
          </p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-white">
            Digital Yard Intake
          </h1>
          <p className="mt-4 max-w-xl text-base font-semibold leading-7 text-white/75">
            Paper becomes digital. Data becomes visibility.
          </p>
        </div>
      </div>
    );
  }

  const renderIntakeFields = () => (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Field
        label="Date"
        name="intakeDate"
        value={draft.intakeDate}
        onChange={(value) => updateDraft("intakeDate", value)}
        focused={focusField === "intakeDate"}
      />
      <Field
        label="Expected Tank No. (from booking)"
        name="expectedTankNo"
        value={draft.expectedTankNo}
        onChange={(value) => updateDraft("expectedTankNo", value)}
        focused={focusField === "expectedTankNo"}
      />
      <Field
        label="Actual / Confirmed Tank No."
        name="tankNo"
        value={draft.tankNo}
        onChange={(value) => updateDraft("tankNo", value)}
        focused={focusField === "tankNo"}
      />
      <Field
        label="Vehicle Reg No."
        name="vehicleRegNo"
        value={draft.vehicleRegNo}
        onChange={(value) => updateDraft("vehicleRegNo", value)}
        focused={focusField === "vehicleRegNo"}
      />
      <Field
        label="Customer"
        name="customer"
        value={draft.customer}
        onChange={(value) => {
          updateDraft("customer", value);
          updateDraft("company", value);
        }}
        focused={focusField === "customer"}
      />
      <Field
        label="Order No."
        name="orderNo"
        value={draft.orderNo}
        onChange={(value) => updateDraft("orderNo", value)}
        focused={focusField === "orderNo"}
      />
      <Field
        label="Receipt / Ref No."
        name="receiptNo"
        value={draft.receiptNo}
        onChange={(value) => updateDraft("receiptNo", value)}
        focused={focusField === "receiptNo"}
      />
      <Field
        label="Customer Ref"
        name="customerRef"
        value={draft.customerRef}
        onChange={(value) => updateDraft("customerRef", value)}
        focused={focusField === "customerRef"}
      />
      <Field
        label="Operator / Supervisor"
        name="opsName"
        value={draft.opsName}
        onChange={(value) => updateDraft("opsName", value)}
        focused={focusField === "opsName"}
      />
      <SelectField
        label="Current Status"
        name="statusStage"
        value={draft.statusStage}
        options={statusOptions}
        onChange={(value) => updateDraft("statusStage", value)}
        focused={focusField === "statusStage"}
      />
      <Field
        label="Yard Location"
        name="currentYardLocation"
        value={draft.currentYardLocation}
        onChange={(value) => updateDraft("currentYardLocation", value)}
        focused={focusField === "currentYardLocation"}
      />
      <Field
        label="Type of Tank"
        name="typeOfTank"
        value={draft.typeOfTank}
        onChange={(value) => updateDraft("typeOfTank", value)}
        focused={focusField === "typeOfTank"}
      />
      <Field
        label="No. of Pots"
        name="noOfPots"
        value={draft.noOfPots}
        onChange={(value) => updateDraft("noOfPots", value)}
        focused={focusField === "noOfPots"}
      />
    </div>
  );

  const renderServiceFields = () => (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Field
        label="Expected Product (from booking)"
        name="expectedProduct"
        value={draft.expectedProduct}
        onChange={(value) => updateDraft("expectedProduct", value)}
        focused={focusField === "expectedProduct"}
      />
      <Field
        label="Actual Previous Product"
        name="previousProduct"
        value={draft.previousProduct}
        onChange={(value) => updateDraft("previousProduct", value)}
        focused={focusField === "previousProduct"}
      />
      <Field
        label="Last Product"
        name="lastProduct"
        value={draft.lastProduct}
        onChange={(value) => updateDraft("lastProduct", value)}
        focused={focusField === "lastProduct"}
      />
      <Field
        label="Category"
        name="category"
        value={draft.category}
        onChange={(value) => updateDraft("category", value)}
        focused={focusField === "category"}
      />
      <Field
        label="Procedure"
        name="procedure"
        value={draft.procedure}
        onChange={(value) => updateDraft("procedure", value)}
        focused={focusField === "procedure"}
      />
      <Field
        label="Clean / Dirty"
        name="cleanDirty"
        value={draft.cleanDirty}
        onChange={(value) => updateDraft("cleanDirty", value)}
        focused={focusField === "cleanDirty"}
      />
      <Field
        label="ECD No."
        name="ecdNo"
        value={draft.ecdNo}
        onChange={(value) => updateDraft("ecdNo", value)}
        focused={focusField === "ecdNo"}
      />
      <Field
        label="Serial No."
        name="serialNo"
        value={draft.serialNo}
        onChange={(value) => updateDraft("serialNo", value)}
        focused={focusField === "serialNo"}
      />
      <Field
        label="Nature of Product"
        name="natureOfProduct"
        value={draft.natureOfProduct}
        onChange={(value) => updateDraft("natureOfProduct", value)}
        focused={focusField === "natureOfProduct"}
      />
      <Field
        label="Next Load"
        name="nextLoad"
        value={draft.nextLoad}
        onChange={(value) => updateDraft("nextLoad", value)}
        focused={focusField === "nextLoad"}
      />
      {(draft.serviceType === "Heating / Steaming" ||
        draft.serviceType === "Storage + Heating") && (
        <>
          <Field
            label="Heating Hours"
            name="heatingHours"
            value={draft.heatingHours}
            onChange={(value) => updateDraft("heatingHours", value)}
            focused={focusField === "heatingHours"}
          />
          <Field
            label="Target Temperature"
            name="targetTemperature"
            value={draft.targetTemperature}
            onChange={(value) => updateDraft("targetTemperature", value)}
            focused={focusField === "targetTemperature"}
          />
          <Field
            label="Start Time"
            name="timeIn"
            value={draft.timeIn}
            onChange={(value) => updateDraft("timeIn", value)}
            focused={focusField === "timeIn"}
          />
          <Field
            label="Stop Time"
            name="timeOut"
            value={draft.timeOut}
            onChange={(value) => updateDraft("timeOut", value)}
            focused={focusField === "timeOut"}
          />
        </>
      )}
      {(draft.serviceType === "Storage" ||
        draft.serviceType === "Storage + Heating") && (
        <Field
          label="Storage Start Date"
          name="storageStartDate"
          value={draft.storageStartDate}
          onChange={(value) => updateDraft("storageStartDate", value)}
          focused={focusField === "storageStartDate"}
        />
      )}
      <Field
        label="Cleaner / Service Name"
        name="cleanerName"
        value={draft.cleanerName}
        onChange={(value) => updateDraft("cleanerName", value)}
        focused={focusField === "cleanerName"}
      />
      <Field
        label="Additional Services"
        name="additionalServices"
        value={draft.additionalServices}
        onChange={(value) => updateDraft("additionalServices", value)}
        focused={focusField === "additionalServices"}
      />
    </div>
  );

  const renderAttachmentFields = () => (
    <div className="grid gap-3 md:grid-cols-2">
      <Field
        label="CMR No."
        name="cmrNo"
        value={draft.cmrNo}
        onChange={(value) => updateDraft("cmrNo", value)}
        focused={focusField === "cmrNo"}
      />
      <Field
        label="Haz No."
        name="hazNo"
        value={draft.hazNo}
        onChange={(value) => updateDraft("hazNo", value)}
        focused={focusField === "hazNo"}
      />
      <Field
        label="Attachment / Document Notes"
        name="attachmentNotes"
        value={draft.attachmentNotes}
        onChange={(value) => updateDraft("attachmentNotes", value)}
        focused={focusField === "attachmentNotes"}
        textarea
        rows={4}
      />
      <Field
        label="Photo Notes"
        name="photoNotes"
        value={draft.photoNotes}
        onChange={(value) => updateDraft("photoNotes", value)}
        focused={focusField === "photoNotes"}
        textarea
        rows={4}
      />
      <Field
        label="Comments"
        name="comments"
        value={draft.comments}
        onChange={(value) => updateDraft("comments", value)}
        focused={focusField === "comments"}
        textarea
        rows={4}
      />
    </div>
  );

  return (
    <>
      <PrintRecordDocument record={lastSavedRecord} intent={exportIntent} receiptKind={receiptKind} />
      <div className="app-shell no-print min-h-screen bg-[radial-gradient(circle_at_top,_#f4f8ff_0%,_#e8effa_45%,_#dde6f4_100%)] p-0 sm:p-3 lg:p-5">
      <div className="mx-auto flex min-h-[100svh] max-w-[1380px] flex-col overflow-hidden border border-white/60 bg-[#F5F8FC] shadow-[0_28px_90px_rgba(11,31,58,0.18)] sm:h-[93vh] sm:min-h-0 sm:rounded-[38px]">
        {screen === "home" && (
          <>
            <AppHeader
              title="SETS Digital Yard Intake"
              subtitle="Controlled workflow from intake to print-ready record."
              right={<Pill tone="dark">Workflow v25</Pill>}
            />
            <div className="flex flex-1 items-center justify-center overflow-auto p-3 sm:p-5">
              <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[0.95fr_1.05fr]">
                <SectionCard className="p-6">
                  <div className="flex h-24 w-40 items-center justify-center rounded-[30px] border border-[#D6DEE8] bg-white px-4 shadow-sm">
                    <img
                      src="./sets-logo.png"
                      alt="SETS logo"
                      className="max-h-16 object-contain"
                    />
                  </div>
                  <h2 className="mt-5 text-3xl font-black leading-tight text-[#172033] sm:text-4xl">
                    One intake. One record. One source of truth.
                  </h2>
                  <WorkflowBar current="Intake" />
                </SectionCard>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    {
                      title: "New / Existing Tank Intake",
                      note: "Start or pull a pre-booked tank, then complete required data.",
                      icon: ClipboardPen,
                      action: startNewIntake,
                      color: "#1F6FEB",
                    },
                    {
                      title: "Saved Records / Print",
                      note: "Open draft cards, fix review items, print or save PDF later.",
                      icon: FileText,
                      action: () => setScreen("records"),
                      color: "#123C69",
                    },
                    {
                      title: "Live Dashboard",
                      note: "Live clean/incomplete separation with review-needed links.",
                      icon: BarChart3,
                      action: () => setScreen("dashboard"),
                      color: "#F97316",
                    },
                    {
                      title: "Scan Barcode",
                      note: "Future shortcut for pulling existing tank records.",
                      icon: QrCode,
                      action: () => undefined,
                      color: "#64748B",
                      disabled: true,
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.title}
                        disabled={item.disabled}
                        onClick={item.action}
                        className={`rounded-[28px] border border-white/80 bg-white p-5 text-left shadow-[0_18px_48px_rgba(17,58,105,0.10)] transition ${item.disabled ? "opacity-70" : "hover:-translate-y-1 hover:border-[#BFDBFE]"}`}
                      >
                        <div
                          className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl"
                          style={{ backgroundColor: `${item.color}16` }}
                        >
                          <Icon
                            className="h-7 w-7"
                            style={{ color: item.color }}
                          />
                        </div>
                        <h3 className="text-lg font-black text-[#172033]">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">
                          {item.note}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

        {screen === "lookupSelect" && (
          <>
            <AppHeader
              title="Select Matching Pre-booked Job"
              subtitle="More than one job matched the strong lookup key. Choose the correct one."
              onBack={() => setScreen("service")}
              onHome={() => setScreen("home")}
              right={<Pill tone="blue">{lookupMatches.length} matches</Pill>}
            />
            <div className="flex-1 overflow-auto p-3 sm:p-5">
              <SectionCard className="p-5">
                <SmallLabel>Multiple match selection</SmallLabel>
                <h3 className="mt-2 text-2xl font-black text-[#172033]">
                  Select the correct pre-booked job
                </h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">
                  This prevents the app from loading the wrong tanker when an
                  order or customer reference covers more than one tank.
                </p>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {lookupMatches.map((match, index) => (
                    <button
                      key={`${match.entry.orderNo}-${match.entry.tankNo}-${index}`}
                      onClick={() =>
                        applyPrebookedMatch(
                          match.entry,
                          match.matchedBy,
                          match.matchedValue,
                        )
                      }
                      className="rounded-2xl border border-[#DCE6F0] bg-white p-4 text-left shadow-sm hover:border-[#1F6FEB]"
                    >
                      <Pill tone="blue">
                        Matched by {match.matchedBy}: {match.matchedValue}
                      </Pill>
                      <h4 className="mt-3 text-xl font-black text-[#172033]">
                        Expected: {match.entry.tankNo || "Tank TBC"}
                      </h4>
                      <p className="mt-1 text-sm font-semibold text-[#64748B]">
                        {match.entry.customer || match.entry.company}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[#64748B]">
                        Order: {match.entry.orderNo || "—"} / Receipt:{" "}
                        {match.entry.receiptNo || "—"}
                      </p>
                      <p className="text-sm font-semibold text-[#64748B]">
                        Product:{" "}
                        {match.entry.previousProduct ||
                          match.entry.lastProduct ||
                          match.entry.natureOfProduct ||
                          "—"}
                      </p>
                    </button>
                  ))}
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {screen === "service" && (
          <>
            <AppHeader
              title="New / Existing Tank Intake"
              subtitle="Select service and pull existing/pre-booked details using strong identifiers."
              onBack={() => setScreen("home")}
              onHome={() => setScreen("home")}
            />
            <div className="grid flex-1 gap-4 overflow-auto p-3 sm:p-5 lg:grid-cols-[1fr_0.9fr]">
              <SectionCard className="p-5">
                <SmallLabel>Step 1 / Intake route</SmallLabel>
                <h3 className="mt-2 text-2xl font-black text-[#172033]">
                  Select service required
                </h3>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {serviceOptions.map((service) => (
                    <button
                      key={service.value}
                      onClick={() => updateDraft("serviceType", service.value)}
                      className={`rounded-2xl border p-4 text-left transition ${draft.serviceType === service.value ? "border-[#1F6FEB] bg-[#EFF6FF]" : "border-[#DCE6F0] bg-white hover:border-[#1F6FEB]"}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-[#172033]">
                          {service.value}
                        </span>
                        {draft.serviceType === service.value && (
                          <CheckCircle2 className="h-5 w-5 text-[#1F6FEB]" />
                        )}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[#64748B]">
                        {service.note}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-sm font-bold leading-6 text-[#166534]">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em]">New / Existing Tank Intake status</p>
                  <p className="mt-1">Selected service: {draft.serviceType}</p>
                  <p>{draft.matchedBy ? `Matched by ${draft.matchedBy}: ${draft.matchedValue}` : "No pre-booked job pulled yet. You can still open the intake form manually."}</p>
                </div>
              </SectionCard>
              <SectionCard className="flex flex-col p-5">
                <SmallLabel>Existing / pre-booked lookup</SmallLabel>
                <p className="mt-3 text-sm font-semibold leading-6 text-[#64748B]">
                  Search by strong data only: Vehicle Reg, Order No., Receipt
                  No., Customer Ref, ECD No. or Serial No. Tank No. and Product
                  are intentionally not searchable because they can change or be
                  mistyped.
                </p>
                <div className="mt-5 flex gap-3">
                  <input
                    value={quickLookup}
                    onChange={(e) => setQuickLookup(e.target.value)}
                    placeholder="Enter vehicle reg, order no., receipt no., customer ref, ECD no. or serial no."
                    className="flex-1 rounded-2xl border border-[#DCE6F0] px-4 py-3 text-sm font-semibold outline-none focus:border-[#1F6FEB]"
                  />
                  <button
                    onClick={findPrebooked}
                    className="rounded-2xl bg-[#0B1F3A] px-5 py-3 text-sm font-black text-white"
                  >
                    Pull details
                  </button>
                </div>
                <div className="mt-3 rounded-2xl border border-dashed border-[#BFD0E4] bg-white p-3 text-xs font-black leading-5 text-[#123C69]">
                  Copy test values: <button onClick={() => setQuickLookup("GN22YND")} className="underline decoration-2 underline-offset-4">GN22YND</button> · <button onClick={() => setQuickLookup("3667214")} className="underline decoration-2 underline-offset-4">3667214</button> · <button onClick={() => setQuickLookup("163738")} className="underline decoration-2 underline-offset-4">163738</button> · <button onClick={() => setQuickLookup("4660549")} className="underline decoration-2 underline-offset-4">4660549</button>
                </div>
                <div className="mt-4 rounded-2xl border border-[#E2EAF3] bg-[#F8FBFE] p-4 text-sm font-semibold leading-6 text-[#64748B]">
                  {lookupMessage}
                </div>
                <div className="mt-3 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4 text-xs font-bold leading-5 text-[#1E3A8A]">
                  Mock-up rule: Tank No. and Product are confirm/edit fields,
                  not search keys. Final exact data formats will be locked in
                  the next phase with SETS.
                </div>
                <div className="mt-3 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4 text-sm font-semibold leading-6 text-[#123C69]">
                  <b>Why:</b> Tank No. and Product are the details being
                  confirmed. The app uses stronger lookup data first, then fills
                  the tank/product details for the operator to verify.
                </div>
                <div className="mt-auto flex gap-3 pt-5">
                  <button
                    onClick={storeIncomplete}
                    disabled={!hasStartedDraft}
                    className={`rounded-2xl border px-4 py-3 text-sm font-black ${hasStartedDraft ? "border-[#D6DEE8] bg-white text-[#172033]" : "cursor-not-allowed border-[#E2E8F0] bg-[#F8FAFC] text-[#94A3B8]"}`}
                  >
                    Store incomplete
                  </button>
                  <button
                    onClick={() => {
                      setFormTab("intake");
                      setScreen("supervisor");
                    }}
                    className="flex-1 rounded-2xl bg-[#0B1F3A] px-5 py-3 text-sm font-black text-white"
                  >
                    Open intake form
                  </button>
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {screen === "supervisor" && (
          <>
            <AppHeader
              title="Tank Intake & Service Data"
              subtitle="Complete intake first, then service data. Driver confirmation stays locked until validation passes."
              onBack={() => setScreen("service")}
              onHome={() => setScreen("home")}
              right={<Pill tone="blue">{draft.serviceType}</Pill>}
            />
            <div className="flex flex-1 flex-col gap-4 overflow-auto p-3 sm:p-5">
              <WorkflowBar
                current={
                  formTab === "intake"
                    ? "Intake"
                    : formTab === "service"
                      ? "Service Data"
                      : "Validation"
                }
              />
              <FixModeBanner
                issue={activeFixIssue}
                stillOpen={activeFixStillOpen}
                recordLabel={activeFixRecordLabel}
                onBackReview={() => setScreen("reviewNeeded")}
                onClear={() => {
                  setActiveFixIssue(null);
                  setActiveFixRecordLabel("");
                  setFocusField(null);
                }}
              />
              <SectionCard className="p-4">
                <div className="mb-4 flex flex-wrap gap-2">
                  {[
                    ["intake", "Intake"],
                    ["service", "Service Data"],
                    ["attachments", "Attachments / Notes"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setFormTab(key as FormTab)}
                      className={`rounded-full px-4 py-2 text-sm font-black ${formTab === key ? "bg-[#0B1F3A] text-white" : "border border-[#D6DEE8] bg-white text-[#64748B]"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {formTab === "intake" && renderIntakeFields()}
                {formTab === "service" && renderServiceFields()}
                {formTab === "attachments" && renderAttachmentFields()}
              </SectionCard>
              <SectionCard className="p-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
                  <div>
                    <SmallLabel>Live validation</SmallLabel>
                    <h3 className="mt-2 text-xl font-black text-[#172033]">
                      {preDriverIssues.length
                        ? "Review needed before driver confirmation"
                        : "Ready for driver confirmation"}
                    </h3>
                    <div className="mt-3">
                      <IssuesList
                        issues={preDriverIssues}
                        onFix={(item) => openFixIssue(item)}
                        emptyText="Intake and service data are complete. Continue to driver confirmation."
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-end gap-3">
                    <button
                      onClick={storeIncomplete}
                      className="rounded-2xl border border-[#D6DEE8] bg-white px-4 py-3 text-sm font-black text-[#172033]"
                    >
                      Store incomplete for later
                    </button>
                    <button
                      onClick={() => setScreen("validation")}
                      className="rounded-2xl bg-[#123C69] px-4 py-3 text-sm font-black text-white"
                    >
                      Run validation
                    </button>
                    <button
                      disabled={preDriverRequiredIssues.length > 0}
                      onClick={continueToDriver}
                      className={`rounded-2xl px-4 py-3 text-sm font-black text-white ${preDriverRequiredIssues.length ? "cursor-not-allowed bg-[#94A3B8]" : "bg-[#0B1F3A]"}`}
                    >
                      Continue to driver confirmation
                    </button>
                  </div>
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {screen === "validation" && (
          <>
            <AppHeader
              title="Validation"
              subtitle="Click any Review Needed item to jump to the exact field that needs fixing."
              onBack={() => setScreen("supervisor")}
              onHome={() => setScreen("home")}
            />
            <div className="flex flex-1 flex-col gap-4 overflow-auto p-3 sm:p-5">
              <WorkflowBar current="Validation" />
              <FixModeBanner
                issue={activeFixIssue}
                stillOpen={activeFixStillOpen}
                recordLabel={activeFixRecordLabel}
                onBackReview={() => setScreen("reviewNeeded")}
                onClear={() => {
                  setActiveFixIssue(null);
                  setActiveFixRecordLabel("");
                  setFocusField(null);
                }}
              />
              <SectionCard className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <SmallLabel>Review check</SmallLabel>
                    <h3 className="mt-2 text-3xl font-black text-[#172033]">
                      {preDriverIssues.length
                        ? "Review Needed"
                        : "Ready for Driver Confirmation"}
                    </h3>
                  </div>
                  <Pill
                    tone={preDriverIssues.length ? "warn" : "good"}
                    onClick={
                      preDriverIssues[0]
                        ? () => openFixIssue(preDriverIssues[0])
                        : undefined
                    }
                  >
                    {preDriverIssues.length
                      ? `${preDriverIssues.length} item(s)`
                      : "No issues"}
                  </Pill>
                </div>
                <div className="mt-5">
                  <IssuesList
                    issues={preDriverIssues}
                    onFix={(item) => openFixIssue(item)}
                    emptyText="All intake and service data is complete."
                  />
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={storeIncomplete}
                    className="rounded-2xl border border-[#D6DEE8] bg-white px-5 py-3 text-sm font-black text-[#172033]"
                  >
                    Store incomplete
                  </button>
                  <button
                    disabled={preDriverRequiredIssues.length > 0}
                    onClick={continueToDriver}
                    className={`flex-1 rounded-2xl px-5 py-3 text-sm font-black text-white ${preDriverRequiredIssues.length ? "cursor-not-allowed bg-[#94A3B8]" : "bg-[#0B1F3A]"}`}
                  >
                    Continue to driver confirmation
                  </button>
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {screen === "driver" && (
          <>
            <AppHeader
              title="Driver Confirmation"
              subtitle="Unlocked only after intake and service validation passes."
              onBack={() => setScreen("validation")}
              onHome={() => setScreen("home")}
            />
            <div className="grid flex-1 gap-4 overflow-auto p-3 sm:p-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="lg:col-span-2">
                <FixModeBanner
                  issue={activeFixIssue}
                  stillOpen={activeFixStillOpen}
                  recordLabel={activeFixRecordLabel}
                  onBackReview={() => setScreen("reviewNeeded")}
                  onClear={() => {
                    setActiveFixIssue(null);
                    setActiveFixRecordLabel("");
                    setFocusField(null);
                  }}
                />
              </div>
              <SectionCard className="p-5">
                <WorkflowBar current="Driver Confirmation" />
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {[
                    ["Tank No.", draft.tankNo || "—"],
                    ["Customer", draft.customer || draft.company || "—"],
                    ["Service", draft.serviceType],
                    ["Vehicle Reg No.", draft.vehicleRegNo || "—"],
                    [
                      "Order / Receipt",
                      draft.orderNo || draft.receiptNo || "—",
                    ],
                    ["Location", draft.currentYardLocation || "—"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-3"
                    >
                      <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[#64748B]">
                        {label}
                      </p>
                      <p className="mt-1 text-sm font-black text-[#172033]">
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </SectionCard>
              <SectionCard className="p-5">
                <SmallLabel>Driver input only</SmallLabel>
                <h3 className="mt-2 text-2xl font-black text-[#172033]">
                  Confirm driver details
                </h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">
                  Shortcut entries such as Shunt, TBC, Unknown, test or dummy
                  are flagged in mock-up mode. Live version should block them
                  once SETS confirms exact rules.
                </p>
                <div className="mt-5 grid gap-4">
                  <Field
                    label="Driver Name"
                    name="driverName"
                    value={draft.driverName}
                    onChange={(value) => updateDraft("driverName", value)}
                    focused={focusField === "driverName"}
                  />
                  <Field
                    label="Company / Haulier"
                    name="driverCompany"
                    value={draft.driverCompany}
                    onChange={(value) => updateDraft("driverCompany", value)}
                    focused={focusField === "driverCompany"}
                  />
                  <SignaturePad
                    value={draft.driverSignature}
                    onChange={(value) => updateDraft("driverSignature", value)}
                    focused={focusField === "driverSignature"}
                  />
                </div>
                <div className="mt-4">
                  <IssuesList
                    issues={driverIssues}
                    onFix={(item) => openFixIssue(item)}
                    emptyText="Driver confirmation is complete."
                  />
                </div>
                {duplicateRecord && !duplicateOverride && (
                  <div className="mt-4 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm font-semibold text-[#991B1B]">
                    <p className="font-black">Duplicate tank warning</p>
                    <p>
                      Tank {draft.tankNo} already exists in Saved Records.
                      Confirm to update this tank rather than creating duplicate
                      yard counts.
                    </p>
                    <button
                      onClick={() => setDuplicateOverride(true)}
                      className="mt-3 rounded-xl bg-[#0B1F3A] px-4 py-2 text-xs font-black text-white"
                    >
                      Update / continue with this tank
                    </button>
                  </div>
                )}
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={storeIncomplete}
                    className="rounded-2xl border border-[#D6DEE8] bg-white px-4 py-3 text-sm font-black text-[#172033]"
                  >
                    Store for later
                  </button>
                  <button
                    disabled={
                      driverRequiredIssues.length > 0 ||
                      Boolean(duplicateRecord && !duplicateOverride)
                    }
                    onClick={continueToFinalReview}
                    className={`flex-1 rounded-2xl px-4 py-3 text-sm font-black text-white ${driverRequiredIssues.length || (duplicateRecord && !duplicateOverride) ? "cursor-not-allowed bg-[#94A3B8]" : "bg-[#0B1F3A]"}`}
                  >
                    Continue to final review
                  </button>
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {screen === "finalReview" && (
          <>
            <AppHeader
              title="Final Review"
              subtitle="Both completed forms are shown together before print/PDF/save."
              onBack={() => setScreen("driver")}
              onHome={() => setScreen("home")}
              right={
                <Pill
                  tone={
                    allRequiredIssues.length
                      ? "warn"
                      : allQualityWarnings.length
                        ? "blue"
                        : "good"
                  }
                  onClick={
                    allIssues[0] ? () => openFixIssue(allIssues[0]) : undefined
                  }
                >
                  {allRequiredIssues.length
                    ? "Review needed"
                    : allQualityWarnings.length
                      ? "Advisory warnings"
                      : "Ready to save"}
                </Pill>
              }
            />
            <div className="flex flex-1 flex-col gap-4 overflow-auto p-3 sm:p-5">
              <WorkflowBar current="Final Review" />
              <FixModeBanner
                issue={activeFixIssue}
                stillOpen={activeFixStillOpen}
                recordLabel={activeFixRecordLabel}
                onBackReview={() => setScreen("reviewNeeded")}
                onClear={() => {
                  setActiveFixIssue(null);
                  setActiveFixRecordLabel("");
                  setFocusField(null);
                }}
              />
              {(allRequiredIssues.length || allQualityWarnings.length) > 0 && (
                <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4 text-sm font-semibold leading-6 text-[#92400E]">
                  <b>
                    {allRequiredIssues.length
                      ? "Draft PDF / Not final:"
                      : "Advisory warnings:"}
                  </b>{" "}
                  {allRequiredIssues.length
                    ? "Required items must be completed before this becomes a final saved record."
                    : "This can be saved as final for mock-up purposes, but warning rules should be tightened in the next phase."}
                </div>
              )}
              <PrintExportNotice record={draftPreviewRecord} intent={exportIntent} />
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard className="p-5">
                  <SmallLabel>Tank Intake Card</SmallLabel>
                  <h3 className="mt-2 text-2xl font-black text-[#172033]">
                    {draft.tankNo || "No tank no."}
                  </h3>
                  <div className="mt-4 grid gap-2 text-sm font-semibold text-[#172033]">
                    <p>Expected tank: {draft.expectedTankNo || "—"}</p>
                    <p>Actual tank: {draft.tankNo || "—"}</p>
                    <p>Customer: {draft.customer || draft.company || "—"}</p>
                    <p>
                      Order/Receipt: {draft.orderNo || draft.receiptNo || "—"}
                    </p>
                    <p>Vehicle Reg No.: {draft.vehicleRegNo || "—"}</p>
                    <p>Yard location: {draft.currentYardLocation || "—"}</p>
                  </div>
                </SectionCard>
                <SectionCard className="p-5">
                  <SmallLabel>Service / ECD Card</SmallLabel>
                  <h3 className="mt-2 text-2xl font-black text-[#172033]">
                    {draft.serviceType}
                  </h3>
                  <div className="mt-4 grid gap-2 text-sm font-semibold text-[#172033]">
                    <p>Expected product: {draft.expectedProduct || "—"}</p>
                    <p>
                      Actual product:{" "}
                      {draft.previousProduct || draft.lastProduct || "—"}
                    </p>
                    <p>Procedure: {draft.procedure || "—"}</p>
                    <p>Heating hours: {draft.heatingHours || "—"}</p>
                    <p>Target temp: {draft.targetTemperature || "—"}</p>
                  </div>
                </SectionCard>
                <SectionCard className="p-5">
                  <SmallLabel>Driver Confirmation Card</SmallLabel>
                  <h3 className="mt-2 text-2xl font-black text-[#172033]">
                    {draft.driverName || "Driver missing"}
                  </h3>
                  <div className="mt-4 grid gap-2 text-sm font-semibold text-[#172033]">
                    <p>Company: {draft.driverCompany || "—"}</p>
                    <p>
                      Signature:{" "}
                      {draft.driverSignature ? "Captured" : "Missing"}
                    </p>
                  </div>
                </SectionCard>
                <SectionCard className="p-5">
                  <SmallLabel>Data Quality Card</SmallLabel>
                  <div className="mt-4">
                    <IssuesList
                      issues={allIssues}
                      onFix={(item) => openFixIssue(item)}
                      emptyText="No issues. Ready to save, print or export PDF."
                    />
                  </div>
                </SectionCard>
              </div>
              <SectionCard className="p-5">
                <SmallLabel>Activity Log</SmallLabel>
                <div className="mt-3 grid gap-2 text-sm font-semibold text-[#64748B] md:grid-cols-2">
                  <p>
                    Created/updated in mock-up: {new Date().toLocaleString()}
                  </p>
                  <p>Current workflow stage: Final Review</p>
                  <p>
                    Matched by:{" "}
                    {draft.matchedBy
                      ? `${draft.matchedBy}: ${draft.matchedValue}`
                      : "Manual entry"}
                  </p>
                  <p>
                    Print/export status:{" "}
                    {allRequiredIssues.length
                      ? "Draft watermark recommended"
                      : "Ready for final output"}
                  </p>
                </div>
              </SectionCard>
              <div className="sticky bottom-0 rounded-2xl border border-[#D6DEE8] bg-white/95 p-3 backdrop-blur">
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={storeIncomplete}
                    className="rounded-2xl border border-[#D6DEE8] bg-white px-4 py-3 text-sm font-black text-[#172033]"
                  >
                    Store in Saved Records
                  </button>
                  <button
                    onClick={() => printRecord(draftPreviewRecord, "print", "sets")}
                    className="rounded-2xl border border-[#D6DEE8] bg-white px-4 py-3 text-sm font-black text-[#172033]"
                  >
                    Print SETS Receipt
                  </button>
                  <button
                    onClick={() => printRecord(draftPreviewRecord, "pdf", "sets")}
                    className="rounded-2xl border border-[#D6DEE8] bg-white px-4 py-3 text-sm font-black text-[#172033]"
                  >
                    Save SETS PDF
                  </button>
                  <button
                    onClick={() => printRecord(draftPreviewRecord, "print", "driver")}
                    className="rounded-2xl border border-[#D6DEE8] bg-white px-4 py-3 text-sm font-black text-[#172033]"
                  >
                    Print Driver Receipt
                  </button>
                  <button
                    onClick={() => printRecord(draftPreviewRecord, "pdf", "driver")}
                    className="rounded-2xl border border-[#D6DEE8] bg-white px-4 py-3 text-sm font-black text-[#172033]"
                  >
                    Save Driver PDF
                  </button>
                  <button
                    disabled={
                      allRequiredIssues.length > 0 ||
                      Boolean(duplicateRecord && !duplicateOverride)
                    }
                    onClick={saveFinalRecord}
                    className={`ml-auto rounded-2xl px-5 py-3 text-sm font-black text-white ${allRequiredIssues.length || (duplicateRecord && !duplicateOverride) ? "cursor-not-allowed bg-[#94A3B8]" : "bg-[#0B1F3A]"}`}
                  >
                    Save final record
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {screen === "record" && (
          <>
            <AppHeader
              title="Saved Record / Print"
              subtitle="Print or save PDF now, or fix review items and return later."
              onBack={() => setScreen("records")}
              onHome={() => setScreen("home")}
              right={
                <Pill
                  tone={
                    lastSavedRecord.dataQuality === "Good" ? "good" : "warn"
                  }
                  onClick={
                    lastSavedRecord.dataQuality === "Review"
                      ? () =>
                          openFixIssue(
                            getReviewIssues(lastSavedRecord, true)[0],
                            lastSavedRecord,
                          )
                      : undefined
                  }
                >
                  {lastSavedRecord.dataQuality === "Good"
                    ? "Good"
                    : "Review needed"}
                </Pill>
              }
            />
            <div className="grid flex-1 gap-4 overflow-auto p-5 lg:grid-cols-[1fr_0.8fr]">
              <SectionCard className="print-page p-5">
                <PrintExportNotice record={lastSavedRecord} intent={exportIntent} />
                <SmallLabel>Complete record</SmallLabel>
                <h3 className="mt-4 text-3xl font-black text-[#172033]">
                  {lastSavedRecord.tankNo}
                </h3>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4">
                    <p className="font-black text-[#172033]">Tank Intake</p>
                    <p className="mt-2 text-sm font-semibold text-[#64748B]">
                      Customer:{" "}
                      {lastSavedRecord.customer || lastSavedRecord.company}
                    </p>
                    <p className="text-sm font-semibold text-[#64748B]">
                      Vehicle Reg No.: {lastSavedRecord.vehicleRegNo || "—"}
                    </p>
                    <p className="text-sm font-semibold text-[#64748B]">
                      Order/Receipt:{" "}
                      {lastSavedRecord.orderNo ||
                        lastSavedRecord.receiptNo ||
                        "—"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4">
                    <p className="font-black text-[#172033]">Service / ECD</p>
                    <p className="mt-2 text-sm font-semibold text-[#64748B]">
                      Service: {lastSavedRecord.serviceType}
                    </p>
                    <p className="text-sm font-semibold text-[#64748B]">
                      Procedure: {lastSavedRecord.procedure || "—"}
                    </p>
                    <p className="text-sm font-semibold text-[#64748B]">
                      Location: {lastSavedRecord.currentYardLocation || "—"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4">
                    <p className="font-black text-[#172033]">
                      Driver Confirmation
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#64748B]">
                      Driver: {lastSavedRecord.driverName || "—"}
                    </p>
                    <p className="text-sm font-semibold text-[#64748B]">
                      Company: {lastSavedRecord.driverCompany || "—"}
                    </p>
                    <p className="text-sm font-semibold text-[#64748B]">
                      Signature:{" "}
                      {lastSavedRecord.driverSignature ? "Captured" : "Missing"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4">
                    <p className="font-black text-[#172033]">
                      Attachments / Notes
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#64748B]">
                      {lastSavedRecord.attachmentNotes ||
                        lastSavedRecord.photoNotes ||
                        "No attachment notes yet."}
                    </p>
                  </div>
                </div>
              </SectionCard>
              <SectionCard className="p-5">
                <SmallLabel>Actions</SmallLabel>
                <div className="mt-3">
                  <OutputStatusBanner record={lastSavedRecord} />
                </div>
                <div className="mt-4 space-y-3">
                  <Pill
                    tone={
                      lastSavedRecord.recordState === "Final Saved"
                        ? "good"
                        : "warn"
                    }
                    onClick={() => {
                      const first = getReviewIssues(lastSavedRecord, true)[0];
                      if (first) openFixIssue(first, lastSavedRecord);
                    }}
                  >
                    {lastSavedRecord.recordState}
                  </Pill>
                  <IssuesList
                    issues={getReviewIssues(lastSavedRecord, true)}
                    onFix={(item) => openFixIssue(item, lastSavedRecord)}
                    emptyText="Record is complete and print-ready."
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={() => printRecord(lastSavedRecord, "print", "sets")}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-[#D6DEE8] bg-white px-3 py-3 text-xs font-black text-[#172033]"
                    >
                      <Printer className="h-4 w-4" /> Print SETS
                    </button>
                    <button
                      onClick={() => printRecord(lastSavedRecord, "pdf", "sets")}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-[#0B1F3A] px-3 py-3 text-xs font-black text-white"
                    >
                      <Save className="h-4 w-4" /> SETS PDF
                    </button>
                    <button
                      onClick={() => printRecord(lastSavedRecord, "print", "driver")}
                      className="flex items-center justify-center gap-2 rounded-2xl border border-[#D6DEE8] bg-white px-3 py-3 text-xs font-black text-[#172033]"
                    >
                      <Printer className="h-4 w-4" /> Print Driver
                    </button>
                    <button
                      onClick={() => printRecord(lastSavedRecord, "pdf", "driver")}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-[#1F6FEB] px-3 py-3 text-xs font-black text-white"
                    >
                      <Save className="h-4 w-4" /> Driver PDF
                    </button>
                  </div>
                  <div className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-3 text-xs font-bold leading-5 text-[#64748B]">
                    <p>Activity log</p>
                    <p>
                      Last updated:{" "}
                      {new Date(lastSavedRecord.updatedAt).toLocaleString()}
                    </p>
                    <p>
                      Matched by:{" "}
                      {lastSavedRecord.matchedBy
                        ? `${lastSavedRecord.matchedBy}: ${lastSavedRecord.matchedValue}`
                        : "Manual entry"}
                    </p>
                    <p>Record state: {lastSavedRecord.recordState}</p>
                  </div>
                  <button
                    onClick={() => setScreen("records")}
                    className="w-full rounded-2xl border border-[#D6DEE8] bg-[#F8FBFE] px-4 py-3 text-sm font-black text-[#172033]"
                  >
                    Back to library
                  </button>
                </div>
              </SectionCard>
            </div>
          </>
        )}

        {screen === "dashboard" && (
          <>
            <AppHeader
              title="Yard Dashboard"
              onBack={() => setScreen("home")}
              onHome={() => setScreen("home")}
              right={
                <div className="hidden items-center gap-2 text-xs font-black text-[#172033] sm:flex">
                  <span className="rounded-lg border border-[#D6DEE8] bg-white px-3 py-2 shadow-sm">
                    📅 Today, May 20
                  </span>
                  <span className="rounded-lg border border-[#D6DEE8] bg-white px-3 py-2 shadow-sm">
                    🕘 09:45 AM
                  </span>
                </div>
              }
            />
            <div className="dashboard-layout grid min-h-0 flex-1 grid-cols-1 overflow-auto bg-[#F4F7FB] xl:grid-cols-[236px_1fr] xl:overflow-hidden">
              <DashboardSidebar
                active="dashboard"
                demoMode={demoMode}
                shownCount={dashboardRecords.length}
                reviewCount={needsAttentionRecords.length}
                onHome={() => setScreen("home")}
                onNewIntake={startNewIntake}
                onNavigate={setScreen}
                onReviewNeeded={() => {
                  setNeedsReviewOnly(true);
                  setStatusFilter("All");
                  setScreen("reviewNeeded");
                }}
              />

              <div className="dashboard-main flex h-full min-h-0 flex-col gap-4 overflow-visible p-3 sm:p-4 lg:p-5 xl:overflow-hidden">
                <div className="dashboard-kpi-grid grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  {[
                    {
                      label: "Tanks on Site",
                      value: dashboardKpis.onSite,
                      tone: "#2563EB",
                      icon: "🚚",
                      action: undefined,
                    },
                    {
                      label: "Waiting Wash",
                      value: dashboardKpis.waitingWash,
                      tone: "#F6C400",
                      icon: "💧",
                      action: () => setScreen("yardStatus"),
                    },
                    {
                      label: "Heating",
                      value: dashboardKpis.heating,
                      tone: "#F97316",
                      icon: "🔥",
                      action: () => setScreen("yardStatus"),
                    },
                    {
                      label: "Storage",
                      value: dashboardKpis.storage,
                      tone: "#7C6ADE",
                      icon: "🛢️",
                      action: () => setScreen("yardStatus"),
                    },
                    {
                      label: "Ready",
                      value: dashboardKpis.ready,
                      tone: "#58B348",
                      icon: "✅",
                      action: () => setScreen("yardStatus"),
                    },
                    {
                      label: "Data Issues",
                      value: dashboardKpis.review,
                      tone: "#FF2B35",
                      icon: "⚠️",
                      action: () => {
                        setNeedsReviewOnly(true);
                        setStatusFilter("All");
                        setScreen("reviewNeeded");
                      },
                    },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      title={item.action ? `Open ${item.label}` : item.label}
                      className="dashboard-kpi-card min-h-[72px] rounded-lg border border-[#DDE6F0] bg-white px-3 py-2 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                    >
                      <div className="flex items-center gap-1.5 text-[10px] font-black leading-none text-[#0B1220]">
                        <span className="text-sm" style={{ color: item.tone }}>{item.icon}</span>
                        <span>{item.label}</span>
                      </div>
                      <p className="mt-2 text-center text-2xl font-black leading-none text-[#0B1220]">
                        {item.value}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="dashboard-chart-stack grid gap-4 xl:min-h-0 xl:flex-1 xl:grid-rows-[1.08fr_0.92fr]">
                  <SectionCard className="dashboard-chart-panel flex min-h-0 flex-col overflow-hidden rounded-2xl p-4 sm:p-6">
                    <h2 className="dashboard-card-title mb-3 shrink-0 text-xl font-black tracking-wide text-[#0B1220] sm:text-[26px]">
                      Tanks by Status
                    </h2>
                    <div className="grid min-h-0 flex-1 items-center gap-4 lg:grid-cols-[1.05fr_1.1fr] lg:gap-6">
                      <div className="dashboard-pie-wrap relative min-h-[220px] sm:h-full sm:min-h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={dashboardStatusSplit}
                              dataKey="value"
                              nameKey="name"
                              innerRadius="48%"
                              outerRadius="78%"
                              paddingAngle={1.5}
                              stroke="#FFFFFF"
                              strokeWidth={3}
                            >
                              {dashboardStatusSplit.map((entry) => (
                                <Cell key={entry.name} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="dashboard-pie-total pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-6xl font-black leading-none text-black">
                            {demoMode ? 68 : kpis.onSite}
                          </p>
                          <p className="mt-2 text-2xl font-bold text-[#6B7280]">
                            Total
                          </p>
                        </div>
                      </div>
                      <div className="dashboard-legend space-y-3 lg:space-y-4 lg:pr-8">
                        {dashboardStatusSplit.map((item) => {
                          const percent = Math.round((item.value / Math.max(dashboardStatusTotal, 1)) * 100);
                          return (
                            <div key={item.name} className="grid items-center gap-3 sm:grid-cols-[32px_1fr_140px] sm:gap-4">
                              <span
                                className="h-6 w-6 rounded-full shadow-sm"
                                style={{ backgroundColor: item.color }}
                              />
                              <span className="text-base font-semibold tracking-wide text-[#0B1220] sm:text-xl xl:text-2xl">
                                {item.name}
                              </span>
                              <span className="text-left text-base font-semibold tracking-wide text-[#0B1220] sm:text-right sm:text-xl xl:text-2xl">
                                {item.value} ({percent}%)
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard className="dashboard-chart-panel flex min-h-0 flex-col overflow-hidden rounded-2xl p-4 sm:p-6">
                    <h2 className="dashboard-card-title mb-2 shrink-0 text-xl font-black tracking-wide text-[#0B1220] sm:text-[26px]">
                      Throughput (Last 7 Days)
                    </h2>
                    <div className="dashboard-bar-wrap min-h-[260px] flex-1">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={dashboardThroughputData}
                          margin={{ top: 12, right: 28, left: 4, bottom: 4 }}
                        >
                          <CartesianGrid
                            stroke="#CBD5E1"
                            strokeDasharray="3 3"
                            vertical={false}
                          />
                          <XAxis
                            dataKey="day"
                            axisLine={{ stroke: "#CBD5E1" }}
                            tickLine={false}
                            tick={{ fontSize: 12, fontWeight: 600, fill: "#111827" }}
                          />
                          <YAxis
                            domain={[0, 100]}
                            ticks={[0, 25, 50, 75, 100]}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 12, fontWeight: 600, fill: "#111827" }}
                          />
                          <Tooltip />
                          <Bar
                            dataKey="count"
                            name="Completed movements"
                            fill="#0B72F0"
                            radius={[0, 0, 0, 0]}
                            barSize={34}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>
                </div>
              </div>
            </div>
          </>
        )}

        {screen === "dataSeparation" && (
          <>
            <AppHeader
              title="Data Separation"
              subtitle="Clear split between demo, live, draft, review-needed, ready and final records."
              onBack={() => setScreen("dashboard")}
              onHome={() => setScreen("home")}
              right={
                <div className="flex items-center gap-2">
                  <BackToDashboardButton onClick={() => setScreen("dashboard")} />
                  <Pill tone={demoMode ? "blue" : "good"}>{demoMode ? "Demo data visible" : "Live only"}</Pill>
                </div>
              }
            />
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto bg-[#EEF4FB] xl:grid-cols-[236px_1fr] xl:overflow-hidden">
              <DashboardSidebar
                active="dataSeparation"
                demoMode={demoMode}
                shownCount={dashboardRecords.length}
                reviewCount={needsAttentionRecords.length}
                onHome={() => setScreen("home")}
                onNewIntake={startNewIntake}
                onNavigate={setScreen}
                onReviewNeeded={() => {
                  setNeedsReviewOnly(true);
                  setStatusFilter("All");
                  setScreen("reviewNeeded");
                }}
              />

              <div className="overflow-auto p-3 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[26px] bg-white p-4 shadow-sm">
                  <div>
                    <SmallLabel>Stage 7</SmallLabel>
                    <h2 className="text-2xl font-black text-[#172033]">
                      Demo, live, draft and final records are separated
                    </h2>
                    <p className="mt-1 max-w-4xl text-sm font-bold leading-6 text-[#64748B]">
                      Demo records are for the SETS presentation only. Live records are created in this browser. Draft/review records are not counted as clean final outputs.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setDemoMode(!demoMode)}
                      className="rounded-2xl border border-[#D6DEE8] bg-white px-4 py-3 text-xs font-black text-[#172033]"
                    >
                      Demo {demoMode ? "ON" : "OFF"}
                    </button>
                    <button
                      onClick={() => setScreen("records")}
                      className="rounded-2xl bg-[#0B1F3A] px-4 py-3 text-xs font-black text-white"
                    >
                      Open Saved Records / Print
                    </button>

                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                  {dataSeparationGroups.map((group) => (
                    <button
                      key={group.key}
                      onClick={group.action}
                      className="rounded-[22px] border border-white bg-white p-4 text-left shadow-sm transition hover:shadow-md"
                    >
                      <Pill tone={group.tone}>{group.title}</Pill>
                      <p className="mt-3 text-3xl font-black text-[#172033]">
                        {group.records.length}
                      </p>
                      <p className="mt-1 text-xs font-bold leading-5 text-[#64748B]">
                        {group.subtitle}
                      </p>
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <SectionCard className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <SmallLabel>Counting Rules</SmallLabel>
                        <h3 className="text-xl font-black text-[#172033]">
                          How the mock-up separates records
                        </h3>
                      </div>
                      <Pill tone="dark">Mock-up logic</Pill>
                    </div>
                    <div className="mt-4 space-y-3 text-sm font-bold leading-6 text-[#64748B]">
                      <div className="rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4 text-[#1E3A8A]">
                        <strong>Demo sample records</strong> stay visible only when Demo Mode is ON and are clearly labelled as presentation data.
                      </div>
                      <div className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4">
                        <strong>Live records</strong> are records saved by the operator in this browser during the mock-up.
                      </div>
                      <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-4 text-[#92400E]">
                        <strong>Draft / Review Needed</strong> records can be stored, but should not be mistaken for clean final records.
                      </div>
                      <div className="rounded-2xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-[#166534]">
                        <strong>Final Saved Records</strong> are the only records labelled as clean final output.
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard className="p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <SmallLabel>Record Split</SmallLabel>
                        <h3 className="text-xl font-black text-[#172033]">
                          Current visible data sources
                        </h3>
                      </div>
                      <Pill tone={demoMode ? "blue" : "good"}>
                        {demoMode ? "Demo + live" : "Live only"}
                      </Pill>
                    </div>
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-[#DCE6F0]">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-[#0B1F3A] text-white">
                          <tr className="text-xs font-black uppercase tracking-[0.14em]">
                            <th className="px-4 py-3">Group</th>
                            <th className="px-4 py-3">Count</th>
                            <th className="px-4 py-3">Purpose</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dataSeparationGroups.map((group) => (
                            <tr key={group.key} className="border-b border-[#EEF2F7] font-bold text-[#172033]">
                              <td className="px-4 py-3"><Pill tone={group.tone}>{group.title}</Pill></td>
                              <td className="px-4 py-3 text-xl font-black">{group.records.length}</td>
                              <td className="px-4 py-3 text-[#64748B]">{group.subtitle}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {dataSeparationGroups.map((group) => (
                    <SectionCard key={group.key} className="p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <div>
                          <SmallLabel>{group.title}</SmallLabel>
                          <h3 className="text-xl font-black text-[#172033]">
                            {group.records.length} record{group.records.length === 1 ? "" : "s"}
                          </h3>
                        </div>
                        <Pill tone={group.tone}>{group.key}</Pill>
                      </div>
                      <div className="space-y-3">
                        {group.records.slice(0, 5).map((record) => {
                          const issues = blockingIssues(getReviewIssues(record, true));
                          return (
                            <div
                              key={`${group.key}-${record.id}`}
                              className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-base font-black text-[#172033]">
                                    {record.tankNo || "Tank pending"}
                                  </p>
                                  <p className="mt-1 text-xs font-bold text-[#64748B]">
                                    {record.customer || record.company || "Customer pending"} • {record.serviceType}
                                  </p>
                                </div>
                                <RecordMetaPills record={record} />
                              </div>
                              <div className="mt-3 grid gap-2 text-xs font-bold text-[#64748B] sm:grid-cols-3">
                                <span>Location: {recordLocationLabel(record)}</span>
                                <span>Status: {record.status}</span>
                                <span>Issues: {issues.length}</span>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  onClick={() => openRecord(record)}
                                  className="rounded-xl bg-[#0B1F3A] px-3 py-2 text-xs font-black text-white"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => setScreen("records")}
                                  className="rounded-xl border border-[#D6DEE8] bg-white px-3 py-2 text-xs font-black text-[#172033]"
                                >
                                  Saved / Print
                                </button>
                                {issues.length > 0 && (
                                  <button
                                    onClick={() => openFixIssue(issues[0], record)}
                                    className="rounded-xl border border-[#F59E0B] bg-[#FFFBEB] px-3 py-2 text-xs font-black text-[#92400E]"
                                  >
                                    Fix first issue
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {!group.records.length && (
                          <div className="rounded-2xl border border-dashed border-[#CBD5E1] bg-[#F8FBFE] p-4 text-sm font-bold text-[#64748B]">
                            No records in this group.
                          </div>
                        )}
                        {group.records.length > 5 && (
                          <button
                            onClick={group.action}
                            className="w-full rounded-2xl border border-[#D6DEE8] bg-white px-4 py-3 text-xs font-black text-[#172033]"
                          >
                            View all {group.records.length}
                          </button>
                        )}
                      </div>
                    </SectionCard>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {screen === "yardStatus" && (
          <>
            <AppHeader
              title="Yard Status"
              subtitle="Current tank status table from the yard dashboard."
              onBack={() => setScreen("dashboard")}
              onHome={() => setScreen("home")}
              right={<BackToDashboardButton onClick={() => setScreen("dashboard")} />}
            />
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto bg-[#EEF4FB] xl:grid-cols-[236px_1fr] xl:overflow-hidden">
              <DashboardSidebar
                active="yardStatus"
                demoMode={demoMode}
                shownCount={dashboardRecords.length}
                reviewCount={needsAttentionRecords.length}
                onHome={() => setScreen("home")}
                onNewIntake={startNewIntake}
                onNavigate={setScreen}
                onReviewNeeded={() => {
                  setNeedsReviewOnly(true);
                  setStatusFilter("All");
                  setScreen("reviewNeeded");
                }}
              />
              <div className="overflow-auto p-3 sm:p-5">
                <CompactTankRecordsTable title="Yard Status" rows={compactTankRows} />
              </div>
            </div>
          </>
        )}

        {screen === "throughput" && (
          <>
            <AppHeader
              title="Throughput Details"
              subtitle="Seven-day throughput, service split and daily movement table."
              onBack={() => setScreen("dashboard")}
              onHome={() => setScreen("home")}
              right={
                <div className="flex items-center gap-2">
                  <BackToDashboardButton onClick={() => setScreen("dashboard")} />
                  <Pill tone={demoMode ? "blue" : "neutral"}>
                    {demoMode ? "Demo Mode ON" : "Live records"}
                  </Pill>
                  <Pill tone="dark">Last 7 days</Pill>
                </div>
              }
            />
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto bg-[#EEF4FB] xl:grid-cols-[236px_1fr] xl:overflow-hidden">
              <DashboardSidebar
                active="throughput"
                demoMode={demoMode}
                shownCount={dashboardRecords.length}
                reviewCount={needsAttentionRecords.length}
                onHome={() => setScreen("home")}
                onNewIntake={startNewIntake}
                onNavigate={setScreen}
                onReviewNeeded={() => {
                  setNeedsReviewOnly(true);
                  setStatusFilter("All");
                  setScreen("reviewNeeded");
                }}
              />

              <div className="overflow-auto p-3 sm:p-5">
                <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
                  <SectionCard className="overflow-hidden p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <SmallLabel>Throughput Last 7 Days</SmallLabel>
                        <h2 className="mt-1 text-3xl font-black text-[#172033]">
                          Daily tank movements by service
                        </h2>
                        <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-[#64748B]">
                          This page shows how many tanks moved through washing, heating and storage each day. For this mock-up, demo mode uses sample crowded-yard figures so SETS can see the management view clearly.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setScreen("yardStatus")}
                          className="rounded-2xl border border-[#D6DEE8] bg-white px-4 py-2 text-xs font-black text-[#172033] shadow-sm"
                        >
                          Yard Status
                        </button>

                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: "Total movements", value: throughputSummary.total, note: "Washing + heating + storage" },
                        { label: "Daily average", value: throughputSummary.average, note: "Average per day" },
                        { label: "Peak day", value: throughputSummary.peak.day, note: `${throughputSummary.peak.count} movements` },
                        { label: "Busiest service", value: throughputSummary.busiest.name, note: `${throughputSummary.busiest.value} movements` },
                      ].map((item) => (
                        <div
                          key={item.label}
                          className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4"
                        >
                          <SmallLabel>{item.label}</SmallLabel>
                          <p className="mt-2 text-3xl font-black text-[#172033]">
                            {item.value}
                          </p>
                          <p className="mt-1 text-xs font-bold text-[#64748B]">
                            {item.note}
                          </p>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <SmallLabel>Data Source</SmallLabel>
                        <h3 className="mt-1 text-xl font-black text-[#172033]">
                          {demoMode ? "Demo sample records" : "Live saved records"}
                        </h3>
                      </div>
                      <Pill tone={demoMode ? "blue" : "good"}>
                        {demoMode ? "Presentation" : "Live"}
                      </Pill>
                    </div>
                    <div className="mt-4 rounded-2xl border border-[#BFDBFE] bg-[#EFF6FF] p-4 text-sm font-bold leading-6 text-[#1E3A8A]">
                      {demoMode
                        ? "Demo Mode ON: figures are sample values designed to show a busy working yard. Live phase will calculate these from real completed records."
                        : "Demo Mode OFF: figures are generated from locally saved mock records in this browser."}
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-[#E3EAF3] bg-white p-4">
                        <SmallLabel>Arrivals shown</SmallLabel>
                        <p className="mt-2 text-2xl font-black text-[#172033]">
                          {throughputSummary.intake}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[#E3EAF3] bg-white p-4">
                        <SmallLabel>Ready shown</SmallLabel>
                        <p className="mt-2 text-2xl font-black text-[#172033]">
                          {throughputSummary.ready}
                        </p>
                      </div>
                    </div>
                  </SectionCard>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_0.75fr]">
                  <SectionCard className="p-5">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <SmallLabel>Visible Bar Chart</SmallLabel>
                        <h3 className="text-2xl font-black text-[#172033]">
                          Throughput by service
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs font-black">
                        <span className="rounded-full bg-[#EFF6FF] px-3 py-1 text-[#1D4ED8]">Washing</span>
                        <span className="rounded-full bg-[#FFF7ED] px-3 py-1 text-[#C2410C]">Heating</span>
                        <span className="rounded-full bg-[#F5F3FF] px-3 py-1 text-[#6D28D9]">Storage</span>
                      </div>
                    </div>
                    <div className="h-[430px] rounded-[24px] border border-[#E3EAF3] bg-[#FBFDFF] p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={throughputData} margin={{ top: 20, right: 24, left: 4, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#DDE7F2" />
                          <XAxis
                            dataKey="day"
                            tick={{ fontSize: 12, fontWeight: 800, fill: "#334155" }}
                            axisLine={{ stroke: "#CBD5E1" }}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fontSize: 12, fontWeight: 800, fill: "#334155" }}
                            axisLine={{ stroke: "#CBD5E1" }}
                            tickLine={false}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(31,111,235,0.06)" }}
                            contentStyle={{ borderRadius: 16, border: "1px solid #D6DEE8", fontWeight: 800 }}
                          />
                          <Legend wrapperStyle={{ fontWeight: 800, fontSize: 12 }} />
                          <Bar dataKey="washing" name="Washing" stackId="a" fill="#1F6FEB" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="heating" name="Heating" stackId="a" fill="#F97316" radius={[0, 0, 0, 0]} />
                          <Bar dataKey="storage" name="Storage" stackId="a" fill="#8B5CF6" radius={[10, 10, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>

                  <SectionCard className="p-5">
                    <SmallLabel>Service Split</SmallLabel>
                    <h3 className="mt-1 text-2xl font-black text-[#172033]">
                      7-day mix
                    </h3>
                    <div className="mt-5 space-y-4">
                      {throughputSummary.services.map((item) => {
                        const percent = throughputSummary.total
                          ? Math.round((item.value / throughputSummary.total) * 100)
                          : 0;
                        return (
                          <div key={item.name}>
                            <div className="mb-2 flex items-center justify-between text-sm font-black text-[#172033]">
                              <span className="flex items-center gap-2">
                                <span
                                  className="h-3 w-3 rounded-full"
                                  style={{ backgroundColor: item.color }}
                                />
                                {item.name}
                              </span>
                              <span>{item.value} ({percent}%)</span>
                            </div>
                            <div className="h-3 overflow-hidden rounded-full bg-[#E8EEF6]">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${percent}%`, backgroundColor: item.color }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-6 rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4">
                      <SmallLabel>Operational reading</SmallLabel>
                      <p className="mt-2 text-sm font-bold leading-6 text-[#64748B]">
                        The split helps management see whether the yard is mainly being loaded by washing demand, heating/steam demand, or storage pressure.
                      </p>
                    </div>
                  </SectionCard>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                  <SectionCard className="overflow-hidden p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <SmallLabel>Daily Count Table</SmallLabel>
                        <h3 className="text-xl font-black text-[#172033]">
                          Day-by-day movements
                        </h3>
                      </div>
                      <Pill tone="neutral">Mock-up table</Pill>
                    </div>
                    <div className="mt-4 overflow-x-auto rounded-2xl border border-[#DCE6F0]">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-[#0B1F3A] text-white">
                          <tr className="text-xs font-black uppercase tracking-[0.14em]">
                            <th className="px-4 py-3">Day</th>
                            <th className="px-4 py-3">Washing</th>
                            <th className="px-4 py-3">Heating</th>
                            <th className="px-4 py-3">Storage</th>
                            <th className="px-4 py-3">Arrivals</th>
                            <th className="px-4 py-3">Ready</th>
                            <th className="px-4 py-3">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {throughputData.map((day) => (
                            <tr key={day.day} className="border-b border-[#EEF2F7] font-bold text-[#172033]">
                              <td className="px-4 py-3 text-[#1D4ED8]">{day.day}</td>
                              <td className="px-4 py-3">{day.washing}</td>
                              <td className="px-4 py-3">{day.heating}</td>
                              <td className="px-4 py-3">{day.storage}</td>
                              <td className="px-4 py-3">{day.intake}</td>
                              <td className="px-4 py-3">{day.ready}</td>
                              <td className="px-4 py-3 font-black">{day.count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </SectionCard>

                  <SectionCard className="p-5">
                    <SmallLabel>Next Phase Reminder</SmallLabel>
                    <h3 className="mt-1 text-xl font-black text-[#172033]">
                      What to connect later
                    </h3>
                    <div className="mt-4 space-y-3 text-sm font-bold leading-6 text-[#64748B]">
                      <div className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4">
                        Link throughput to real status transitions: arrived, wash complete, heating complete, storage start/end and departed.
                      </div>
                      <div className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4">
                        Decide whether throughput means completed services only, all tank movements, or chargeable movements.
                      </div>
                      <div className="rounded-2xl border border-[#E3EAF3] bg-[#F8FBFE] p-4">
                        Add date filters, weekly/monthly export and customer-specific throughput once real data is available.
                      </div>
                    </div>
                  </SectionCard>
                </div>
              </div>
            </div>
          </>
        )}

        {screen === "recentRecords" && (
          <>
            <AppHeader
              title="Recent Tank Records"
              subtitle="Compact operational table view like the SETS dashboard mock-up."
              onBack={() => setScreen("dashboard")}
              onHome={() => setScreen("home")}
              right={<BackToDashboardButton onClick={() => setScreen("dashboard")} />}
            />
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto bg-[#EEF4FB] xl:grid-cols-[236px_1fr] xl:overflow-hidden">
              <DashboardSidebar
                active="recentRecords"
                demoMode={demoMode}
                shownCount={dashboardRecords.length}
                reviewCount={needsAttentionRecords.length}
                onHome={() => setScreen("home")}
                onNewIntake={startNewIntake}
                onNavigate={setScreen}
                onReviewNeeded={() => {
                  setNeedsReviewOnly(true);
                  setStatusFilter("All");
                  setScreen("reviewNeeded");
                }}
              />
              <div className="overflow-auto p-3 sm:p-5">
                <CompactTankRecordsTable title="Recent Tank Records" rows={compactTankRows} />
              </div>
            </div>
          </>
        )}

        {screen === "reviewNeeded" && (
          <>
            <AppHeader
              title="Review Needed"
              subtitle="Only records with missing required information are shown here."
              onBack={() => setScreen("dashboard")}
              onHome={() => setScreen("home")}
              right={
                <div className="flex items-center gap-2">
                  <BackToDashboardButton onClick={() => setScreen("dashboard")} />
                  <Pill tone="warn">
                    {needsAttentionRecords.length} record(s)
                  </Pill>
                </div>
              }
            />
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto bg-[#EEF4FB] xl:grid-cols-[236px_1fr] xl:overflow-hidden">
              <DashboardSidebar
                active="reviewNeeded"
                demoMode={demoMode}
                shownCount={dashboardRecords.length}
                reviewCount={needsAttentionRecords.length}
                onHome={() => setScreen("home")}
                onNewIntake={startNewIntake}
                onNavigate={setScreen}
                onReviewNeeded={() => {
                  setNeedsReviewOnly(true);
                  setStatusFilter("All");
                  setScreen("reviewNeeded");
                }}
              />
              <div className="overflow-auto p-3 sm:p-5">
                <div className="mb-4 grid gap-3 rounded-[22px] bg-white p-4 shadow-sm sm:p-5 lg:grid-cols-[1fr_auto_auto]">
                  <div>
                    <SmallLabel>Review Needed</SmallLabel>
                    <h2 className="text-2xl font-black text-[#172033]">
                      One clean exception list
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-[#64748B]">
                      The demo data is now mostly clean. This page only shows the one record that still needs completion.
                    </p>
                  </div>
                  <button
                    onClick={() => setScreen("records")}
                    className="rounded-2xl border border-[#D6DEE8] bg-white px-4 py-3 text-sm font-black text-[#172033]"
                  >
                    Open record library
                  </button>
                  <button
                    onClick={startNewIntake}
                    className="rounded-2xl bg-[#0B1F3A] px-4 py-3 text-sm font-black text-white"
                  >
                    Start new intake
                  </button>
                </div>

                {needsAttentionRecords.length === 0 ? (
                  <SectionCard className="p-8 text-center">
                    <CheckCircle2 className="mx-auto h-12 w-12 text-[#16A34A]" />
                    <h3 className="mt-4 text-2xl font-black text-[#172033]">
                      No review-needed records
                    </h3>
                    <p className="mt-2 text-sm font-semibold text-[#64748B]">
                      All visible records are clean for the current filters.
                    </p>
                  </SectionCard>
                ) : (
                  <div className="grid max-w-5xl gap-4">
                    {needsAttentionRecords.map((record) => {
                      const issues = getReviewIssues(record, true);
                      const required = blockingIssues(issues);
                      return (
                        <SectionCard key={record.id} className="p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <SmallLabel>{record.recordState}</SmallLabel>
                              <h3 className="mt-2 text-2xl font-black text-[#172033]">
                                {record.tankNo || "Draft record"}
                              </h3>
                              <p className="mt-1 text-sm font-semibold text-[#64748B]">
                                {record.customer ||
                                  record.company ||
                                  "Customer missing"}{" "}
                                • {record.serviceType}
                              </p>
                            </div>
                            <div className="text-right">
                              <RecordMetaPills record={record} />
                              <p className="mt-2 text-xs font-black text-[#92400E]">
                                {required.length} required •{" "}
                                {issues.length - required.length} advisory
                              </p>
                            </div>
                          </div>
                          <div className="mt-4">
                            <OutputStatusBanner record={record} />
                          </div>
                          <div className="mt-4">
                            <IssuesList
                              issues={issues}
                              onFix={(item) => openFixIssue(item, record)}
                            />
                          </div>
                          <div className="mt-5 flex flex-wrap gap-2">
                            {firstIssueForRecord(record) && (
                              <button
                                onClick={() => {
                                  const firstIssue = firstIssueForRecord(record);
                                  if (firstIssue) openFixIssue(firstIssue, record);
                                }}
                                className="rounded-xl bg-[#F59E0B] px-3 py-2 text-xs font-black text-white"
                              >
                                Fix first blocking item
                              </button>
                            )}
                            <button
                              onClick={() => openRecord(record)}
                              className="rounded-xl bg-[#0B1F3A] px-3 py-2 text-xs font-black text-white"
                            >
                              Open full record
                            </button>
                            <button
                              onClick={() => editRecord(record, "intake")}
                              className="rounded-xl border border-[#D6DEE8] bg-white px-3 py-2 text-xs font-black text-[#172033]"
                            >
                              Edit intake
                            </button>
                            <button
                              onClick={() => setScreen("records")}
                              className="rounded-xl border border-[#D6DEE8] bg-white px-3 py-2 text-xs font-black text-[#172033]"
                            >
                              Back to library
                            </button>
                          </div>
                        </SectionCard>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {screen === "records" && (
          <>
            <AppHeader
              title="Saved Records / Print"
              subtitle="Document library for drafts, review items, ready records and final PDFs."
              onBack={() => setScreen("dashboard")}
              onHome={() => setScreen("home")}
              right={
                <div className="flex flex-wrap gap-2">
                  <BackToDashboardButton onClick={() => setScreen("dashboard")} />
                  <Pill tone="blue">Shown {librarySummary.shown}</Pill>
                  <Pill tone="warn">Review {librarySummary.review}</Pill>
                  <Pill tone="dark">Ready {librarySummary.readyPrint}</Pill>
                  <Pill tone="good">Final {librarySummary.final}</Pill>
                </div>
              }
            />
            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto bg-[#EEF4FB] xl:grid-cols-[236px_1fr] xl:overflow-hidden">
              <DashboardSidebar
                active="records"
                demoMode={demoMode}
                shownCount={dashboardRecords.length}
                reviewCount={needsAttentionRecords.length}
                onHome={() => setScreen("home")}
                onNewIntake={startNewIntake}
                onNavigate={setScreen}
                onReviewNeeded={() => {
                  setNeedsReviewOnly(true);
                  setStatusFilter("All");
                  setScreen("reviewNeeded");
                }}
              />
              <div className="overflow-auto p-3 sm:p-5">
                <div className="mb-4 rounded-[28px] bg-[linear-gradient(135deg,_#0B1F3A_0%,_#123C69_100%)] p-5 text-white shadow-[0_18px_48px_rgba(11,31,58,0.18)]">
                  <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <SmallLabel>Saved Records / Print Library</SmallLabel>
                      <h2 className="mt-2 text-3xl font-black">Records ready for admin control</h2>
                      <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/75">
                        This page is not the live operations table. It is the record library for opening, continuing, fixing, printing and saving PDFs from draft through final saved status.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-3">
                      {[
                        ["Draft", librarySummary.draft],
                        ["Review", librarySummary.review],
                        ["Ready", librarySummary.readyPrint],
                        ["Driver", librarySummary.readyDriver + librarySummary.driverConfirmed],
                        ["Final", librarySummary.final],
                        ["Shown", librarySummary.shown],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/60">{label}</p>
                          <p className="mt-1 text-2xl font-black text-white">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mb-4 grid gap-3 rounded-2xl bg-white p-4 shadow-sm lg:grid-cols-[1fr_auto_auto_auto_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#64748B]" />
                    <input
                      value={dashboardSearch}
                      onChange={(e) => setDashboardSearch(e.target.value)}
                      placeholder="Search tank, customer, order, vehicle, product or location..."
                      className="w-full rounded-2xl border border-[#DCE6F0] py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-[#1F6FEB] focus:ring-2 focus:ring-[#DCEBFA]"
                    />
                  </div>
                  <select
                    value={serviceFilter}
                    onChange={(e) =>
                      setServiceFilter(e.target.value as ServiceType | "All")
                    }
                    className="rounded-2xl border border-[#DCE6F0] bg-white px-4 py-3 text-sm font-black"
                  >
                    <option>All</option>
                    {serviceOptions.map((service) => (
                      <option key={service.value}>{service.value}</option>
                    ))}
                  </select>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-2xl border border-[#DCE6F0] bg-white px-4 py-3 text-sm font-black"
                  >
                    <option>All</option>
                    {[
                      "Draft",
                      "Review Needed",
                      "Ready for Driver",
                      "Driver Confirmed",
                      "Ready to Print",
                      "Final Saved",
                      ...statusOptions,
                    ].map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setNeedsReviewOnly(!needsReviewOnly)}
                    className={`rounded-2xl px-4 py-3 text-sm font-black ${needsReviewOnly ? "bg-[#F59E0B] text-white" : "border border-[#DCE6F0] bg-white text-[#172033]"}`}
                  >
                    Review only
                  </button>
                  <button
                    onClick={() => {
                      setDashboardSearch("");
                      setServiceFilter("All");
                      setStatusFilter("All");
                      setNeedsReviewOnly(false);
                    }}
                    className="rounded-2xl border border-[#DCE6F0] bg-white px-4 py-3 text-sm font-black text-[#172033]"
                  >
                    Clear filters
                  </button>
                </div>

                <div className="mb-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                  {[
                    { label: "Draft / Incomplete", value: librarySummary.draft, status: "Draft", tone: "neutral" as const },
                    { label: "Review Needed", value: librarySummary.review, status: "Review Needed", tone: "warn" as const },
                    { label: "Ready for Driver", value: librarySummary.readyDriver, status: "Ready for Driver", tone: "blue" as const },
                    { label: "Driver Confirmed", value: librarySummary.driverConfirmed, status: "Driver Confirmed", tone: "blue" as const },
                    { label: "Ready to Print", value: librarySummary.readyPrint, status: "Ready to Print", tone: "dark" as const },
                    { label: "Final Saved", value: librarySummary.final, status: "Final Saved", tone: "good" as const },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => {
                        setStatusFilter(item.status);
                        setNeedsReviewOnly(item.status === "Review Needed");
                      }}
                      className="rounded-2xl border border-[#DCE6F0] bg-white p-4 text-left shadow-sm hover:border-[#1F6FEB]"
                    >
                      <Pill tone={item.tone}>{item.label}</Pill>
                      <p className="mt-3 text-3xl font-black text-[#172033]">{item.value}</p>
                    </button>
                  ))}
                </div>

                <div className="space-y-6">
                  {librarySections.map((section) => (
                    <SectionCard key={section.key} className="overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E3EAF3] bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-5">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Pill tone={section.tone}>{section.title}</Pill>
                            <Pill tone="neutral">{section.records.length} record(s)</Pill>
                          </div>
                          <p className="mt-2 text-sm font-semibold leading-6 text-[#64748B]">{section.subtitle}</p>
                        </div>
                        {section.key === "review" && section.records.length > 0 && (
                          <button
                            onClick={() => {
                              setNeedsReviewOnly(true);
                              setScreen("reviewNeeded");
                            }}
                            className="rounded-2xl bg-[#F59E0B] px-4 py-3 text-sm font-black text-white shadow-sm"
                          >
                            Open Review Needed page
                          </button>
                        )}
                      </div>

                      {section.records.length === 0 ? (
                        <div className="p-6 text-sm font-semibold text-[#64748B]">
                          No records in this section with the current filters.
                        </div>
                      ) : (
                        <div className="grid gap-4 p-5 lg:grid-cols-2 2xl:grid-cols-3">
                          {section.records.map((record) => {
                            const issues = getReviewIssues(record, true);
                            const firstIssue = issues[0];
                            const label = recordOutputLabel(record);
                            const isDraftOutput = label.startsWith("DRAFT");
                            const isFinalOutput = label === "FINAL SAVED RECORD";
                            return (
                              <div
                                key={record.id}
                                className="rounded-[24px] border border-[#DCE6F0] bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] p-4 shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <SmallLabel>{record.recordState}</SmallLabel>
                                    <h3 className="mt-2 truncate text-2xl font-black text-[#172033]">
                                      {record.tankNo || record.expectedTankNo || "Draft record"}
                                    </h3>
                                    <p className="mt-1 truncate text-sm font-semibold text-[#64748B]">
                                      {record.customer || record.company || "Customer missing"}
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-2">
                                    <Pill tone={recordSourceTone(record)}>{recordSourceLabel(record)}</Pill>
                                    <Pill
                                      tone={record.dataQuality === "Good" ? "good" : "warn"}
                                      onClick={firstIssue ? () => openFixIssue(firstIssue, record) : undefined}
                                    >
                                      {record.dataQuality === "Good" ? "Good" : "Review needed"}
                                    </Pill>
                                  </div>
                                </div>

                                <div className="mt-4 grid gap-2 rounded-2xl border border-[#E3EAF3] bg-white p-3 text-sm font-semibold text-[#64748B]">
                                  <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-2">
                                    <span className="font-black text-[#172033]">Service</span>
                                    <span>{record.serviceType}</span>
                                  </div>
                                  <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-2">
                                    <span className="font-black text-[#172033]">Status</span>
                                    <span>{record.status}</span>
                                  </div>
                                  <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-2">
                                    <span className="font-black text-[#172033]">Location</span>
                                    <span>{recordLocationLabel(record)}</span>
                                  </div>
                                  <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-2">
                                    <span className="font-black text-[#172033]">Vehicle</span>
                                    <span>{record.vehicleRegNo || "Missing"}</span>
                                  </div>
                                  <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-2">
                                    <span className="font-black text-[#172033]">Updated</span>
                                    <span>{new Date(record.updatedAt).toLocaleString()}</span>
                                  </div>
                                </div>

                                <div className="mt-4">
                                  <OutputStatusBanner record={record} />
                                </div>

                                {issues.length > 0 && (
                                  <div className="mt-4 rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-sm font-black text-[#92400E]">
                                        {issues.length} review item(s)
                                      </p>
                                      {firstIssue && (
                                        <button
                                          onClick={() => openFixIssue(firstIssue, record)}
                                          className="rounded-xl bg-[#F59E0B] px-3 py-2 text-xs font-black text-white"
                                        >
                                          Fix first issue
                                        </button>
                                      )}
                                    </div>
                                    <div className="mt-3">
                                      <IssuesList
                                        issues={issues.slice(0, 2)}
                                        onFix={(item) => openFixIssue(item, record)}
                                      />
                                    </div>
                                  </div>
                                )}

                                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                                  <button
                                    onClick={() => openRecord(record)}
                                    className="rounded-xl bg-[#0B1F3A] px-3 py-2 text-xs font-black text-white"
                                  >
                                    View Full Record
                                  </button>
                                  <button
                                    onClick={() => editRecord(record, "intake")}
                                    className="rounded-xl border border-[#D6DEE8] bg-white px-3 py-2 text-xs font-black text-[#172033]"
                                  >
                                    Open / Continue
                                  </button>
                                  <button
                                    onClick={() => printRecord(record, "print", "sets")}
                                    className={`rounded-xl px-3 py-2 text-xs font-black ${isDraftOutput ? "border border-[#F59E0B] bg-[#FFFBEB] text-[#92400E]" : "border border-[#D6DEE8] bg-white text-[#172033]"}`}
                                  >
                                    <span className="inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Print SETS</span>
                                  </button>
                                  <button
                                    onClick={() => printRecord(record, "pdf", "sets")}
                                    className={`rounded-xl px-3 py-2 text-xs font-black ${isFinalOutput ? "bg-[#16A34A] text-white" : "bg-[#1F6FEB] text-white"}`}
                                  >
                                    <span className="inline-flex items-center gap-1"><Save className="h-3.5 w-3.5" />SETS PDF</span>
                                  </button>
                                  <button
                                    onClick={() => printRecord(record, "print", "driver")}
                                    className="rounded-xl border border-[#D6DEE8] bg-white px-3 py-2 text-xs font-black text-[#172033]"
                                  >
                                    <span className="inline-flex items-center gap-1"><Printer className="h-3.5 w-3.5" />Print Driver</span>
                                  </button>
                                  <button
                                    onClick={() => printRecord(record, "pdf", "driver")}
                                    className="rounded-xl bg-[#0B1F3A] px-3 py-2 text-xs font-black text-white"
                                  >
                                    <span className="inline-flex items-center gap-1"><Save className="h-3.5 w-3.5" />Driver PDF</span>
                                  </button>
                                  {firstIssue && (
                                    <button
                                      onClick={() => openFixIssue(firstIssue, record)}
                                      className="col-span-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs font-black text-[#92400E]"
                                    >
                                      Fix Review Items
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </SectionCard>
                  ))}
                </div>

                <div className="mt-6 rounded-2xl border border-[#D6DEE8] bg-white p-4 text-sm font-semibold leading-6 text-[#64748B] shadow-sm">
                  <b className="text-[#172033]">Library rule:</b> Yard Status is the fast manager table. This page is for document handling only: open/continue drafts, fix review items, view full records, print, and save PDF. In the next live phase, Save PDF should generate a real file instead of using the browser print dialog.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}

export default App;
