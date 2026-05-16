import type { ComponentType, SVGProps } from 'react'
import type { TypeCode } from '../lib/personality'
import { DeepDiverIcon } from './personality/DeepDiver'
import { CodeAppraiserIcon } from './personality/CodeAppraiser'
import { LibrarianIcon } from './personality/Librarian'
import { TrendHunterIcon } from './personality/TrendHunter'
import { MasterSmithIcon } from './personality/MasterSmith'
import { LightningFixerIcon } from './personality/LightningFixer'
import { AllroundBuilderIcon } from './personality/AllroundBuilder'
import { ChaosCreatorIcon } from './personality/ChaosCreator'
import { NightOwlIcon } from './time/NightOwl'
import { EarlyBirdIcon } from './time/EarlyBird'
import { MorningWarriorIcon } from './time/MorningWarrior'
import { AfternoonWarriorIcon } from './time/AfternoonWarrior'
import { EveningCoderIcon } from './time/EveningCoder'
import { MoonlightCoderIcon } from './time/MoonlightCoder'
import { FeatureIcon } from './role/Feature'
import { DebugIcon } from './role/Debug'
import { RefactorIcon } from './role/Refactor'
import { ReviewIcon } from './role/Review'
import { WritingIcon } from './role/Writing'
import { DesignIcon } from './role/Design'
import { DevopsIcon } from './role/Devops'
import { DataIcon } from './role/Data'
import { TestIcon } from './role/Test'
import { ReadIcon } from './tools/Read'
import { EditIcon } from './tools/Edit'
import { WriteIcon } from './tools/Write'
import { BashIcon } from './tools/Bash'
import { GrepIcon } from './tools/Grep'
import { GlobIcon } from './tools/Glob'
import { AgentIcon } from './tools/Agent'
import { WebIcon } from './tools/Web'
import { WrenchIcon } from './tools/Wrench'
import { Rank1Icon } from './tools/Rank1'
import { BrandMarkIcon } from './system/BrandMark'
import { EmptySessionsIcon } from './system/EmptySessions'
import { WarningIcon } from './system/Warning'

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>

export type CodingTimeIconKey =
  | 'Night Owl'
  | 'Early Bird'
  | 'Morning Warrior'
  | 'Afternoon Warrior'
  | 'Evening Coder'
  | 'Moonlight Coder'

export type RoleIconKey =
  | 'feature'
  | 'debug'
  | 'refactor'
  | 'review'
  | 'writing'
  | 'design'
  | 'devops'
  | 'data'
  | 'test'

export type ToolIconKey =
  | 'Read'
  | 'Edit'
  | 'Write'
  | 'Bash'
  | 'Grep'
  | 'Glob'
  | 'Agent'
  | 'WebSearch'
  | 'WebFetch'

export type SystemIconKey = 'brandMark' | 'emptySessions' | 'warning' | 'toolGlyph'

export const PERSONALITY_ICONS: Record<TypeCode, IconComponent> = {
  RDM: DeepDiverIcon,
  RDS: CodeAppraiserIcon,
  RWM: LibrarianIcon,
  RWS: TrendHunterIcon,
  EDM: MasterSmithIcon,
  EDS: LightningFixerIcon,
  EWM: AllroundBuilderIcon,
  EWS: ChaosCreatorIcon,
}

export const TIME_ICONS: Record<CodingTimeIconKey, IconComponent> = {
  'Night Owl': NightOwlIcon,
  'Early Bird': EarlyBirdIcon,
  'Morning Warrior': MorningWarriorIcon,
  'Afternoon Warrior': AfternoonWarriorIcon,
  'Evening Coder': EveningCoderIcon,
  'Moonlight Coder': MoonlightCoderIcon,
}

export const ROLE_ICONS: Record<RoleIconKey, IconComponent> = {
  feature: FeatureIcon,
  debug: DebugIcon,
  refactor: RefactorIcon,
  review: ReviewIcon,
  writing: WritingIcon,
  design: DesignIcon,
  devops: DevopsIcon,
  data: DataIcon,
  test: TestIcon,
}

export const TOOL_ICONS: Record<ToolIconKey, IconComponent> = {
  Read: ReadIcon,
  Edit: EditIcon,
  Write: WriteIcon,
  Bash: BashIcon,
  Grep: GrepIcon,
  Glob: GlobIcon,
  Agent: AgentIcon,
  WebSearch: WebIcon,
  WebFetch: WebIcon,
}

export const ToolDefaultIcon = WrenchIcon

export const SYSTEM_ICONS: Record<SystemIconKey, IconComponent> = {
  brandMark: BrandMarkIcon,
  emptySessions: EmptySessionsIcon,
  warning: WarningIcon,
  toolGlyph: WrenchIcon,
}

export {
  DeepDiverIcon,
  CodeAppraiserIcon,
  LibrarianIcon,
  TrendHunterIcon,
  MasterSmithIcon,
  LightningFixerIcon,
  AllroundBuilderIcon,
  ChaosCreatorIcon,
  NightOwlIcon,
  EarlyBirdIcon,
  MorningWarriorIcon,
  AfternoonWarriorIcon,
  EveningCoderIcon,
  MoonlightCoderIcon,
  FeatureIcon,
  DebugIcon,
  RefactorIcon,
  ReviewIcon,
  WritingIcon,
  DesignIcon,
  DevopsIcon,
  DataIcon,
  TestIcon,
  ReadIcon,
  EditIcon,
  WriteIcon,
  BashIcon,
  GrepIcon,
  GlobIcon,
  AgentIcon,
  WebIcon,
  WrenchIcon,
  Rank1Icon,
  BrandMarkIcon,
  EmptySessionsIcon,
  WarningIcon,
}
