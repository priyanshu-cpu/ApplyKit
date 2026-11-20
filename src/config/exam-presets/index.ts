import type { FileKind } from "../../lib/files";
import type { ImageRule } from "../../lib/validation";
export type SupportingRule = {
  name: string;
  formats?: FileKind[];
  minKB?: number;
  maxKB?: number;
  minFiles?: number;
  maxPages?: number;
  paper?: "a4";
  conditional?: boolean;
  manual?: boolean;
  detail?: string;
};
export type Rules = {
  photo: ImageRule;
  signature: ImageRule;
  supporting: SupportingRule[];
};
export type ExamPreset = Rules & {
  id: string;
  name: string;
  organization: string;
  notification: string;
  source: string;
  verified: string;
  notes: string[];
};
export const examPresets: ExamPreset[] = [
  {
    id: "ibps-csa-xv-2025",
    name: "IBPS Customer Service Associate XV (2025, archived)",
    organization: "Institute of Banking Personnel Selection",
    notification: "CRP-CSA-XV, Annexure IV",
    source:
      "https://www.ibps.in/wp-content/uploads/DetailedNotification_CRP_CSA_XV_Final_for_Website_12.9.2025.pdf",
    verified: "2026-11-20",
    photo: {
      width: 200,
      height: 230,
      preferredDimensions: true,
      minKB: 20,
      maxKB: 50,
      formats: ["image/jpeg"],
    },
    signature: {
      width: 140,
      height: 60,
      preferredDimensions: true,
      minKB: 10,
      maxKB: 20,
      formats: ["image/jpeg"],
    },
    supporting: [
      {
        name: "Thumb impression",
        formats: ["image/jpeg"],
        minKB: 20,
        maxKB: 50,
        minFiles: 1,
        detail:
          "240 × 240 px and 200 DPI are preferred. Follow the notice for permitted alternatives.",
      },
      {
        name: "Handwritten declaration",
        formats: ["image/jpeg"],
        minKB: 50,
        maxKB: 100,
        minFiles: 1,
        detail:
          "800 × 400 px and 200 DPI are preferred. Follow the official declaration text.",
      },
      {
        name: "Class 10 or equivalent certificate",
        formats: ["application/pdf"],
        maxKB: 500,
        paper: "a4",
        minFiles: 1,
      },
      {
        name: "Clause K(ix) certificate",
        formats: ["application/pdf"],
        maxKB: 500,
        paper: "a4",
        conditional: true,
      },
      {
        name: "Live photograph",
        manual: true,
        detail: "Capture this in the official application portal.",
      },
    ],
    notes: [
      "This archived preset is specific to the 2025 recruitment notice. Check the current notification for a new application.",
      "Preferred dimensions are used for preparation. The checklist leaves preferred dimensions for manual review.",
      "Check the original notice for required photo content, signature appearance, supporting documents and capture instructions.",
    ],
  },
];
