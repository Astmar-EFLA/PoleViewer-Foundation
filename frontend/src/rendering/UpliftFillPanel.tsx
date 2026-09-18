import { useProjectStore } from "../state/projectStore";
import { validateUpliftFillInstance } from "../validation/fillValidation";
import { FillLayerPanel } from "./FillLayerPanel";

const DESCRIPTION =
  "Covers the whole foundation -- pad and pedestal/column both -- up to its own top, for backfill weight to " +
  "sustain uplift. Independent of the fill above (a foundation can have both); visible by default.";

export function UpliftFillPanel() {
  const project = useProjectStore((s) => s.project);
  const setUpliftFillStyle = useProjectStore((s) => s.setUpliftFillStyle);
  const setUpliftFillParameters = useProjectStore((s) => s.setUpliftFillParameters);

  if (!project) return null;

  return (
    <FillLayerPanel
      project={project}
      description={DESCRIPTION}
      instances={project.upliftFillInstances}
      validate={validateUpliftFillInstance}
      setStyle={setUpliftFillStyle}
      setParameters={setUpliftFillParameters}
    />
  );
}
