export type ReviewContent = {
  preview: boolean
  unit: boolean
  tests: boolean
  log: boolean
  environment: boolean
}
export type ReviewContentService = { inspect(id: string): Promise<ReviewContent> }
