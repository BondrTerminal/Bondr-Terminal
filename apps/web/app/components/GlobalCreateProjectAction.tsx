'use client';
import { CreateProjectLauncher } from './CreateProjectLauncher';
export function GlobalCreateProjectAction() {
  return <CreateProjectLauncher mode="modal" label="+ Create Project" />;
}
