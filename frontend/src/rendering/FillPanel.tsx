import { useProjectStore } from "../state/projectStore";
import { validateFillInstance } from "../validation/fillValidation";
import { FillLayerPanel } from "./FillLayerPanel";

const DESCRIPTION =
  "For a foundation whose base sits above existing terrain -- material added underneath/around it to bring " +
  "grade up to the base, the mirror of an excavation. Visible by default; toggle off for legs it doesn't apply to.";

export function FillPanel() {
  const project = useProjectStore((s) => s.project);
  const setFillStyle = useProjectStore((s) => s.setFillStyle);
  const setFillParameters = useProjectStore((s) => s.setFillParameters);

  if (!project) return null;

  return (
    <FillLayerPanel
      project={project}
      description={DESCRIPTION}
      instances={project.fillInstances}
      validate={validateFillInstance}
      setStyle={setFillStyle}
      setParameters={setFillParameters}
    />
  );
}
