import { expect, test } from "@playwright/test"

test("모든 파일 화면에서 이미지·SVG 원본·비교 대상을 데스크톱과 모바일로 확인한다", async ({
  page,
  request,
}) => {
  const connected = await request.post("/api/projects", {
    data: { path: "/tmp/image-viewer-fixture", name: "Image fixture" },
  })
  expect(connected.ok()).toBeTruthy()
  const project = await connected.json()
  const tracking = await request.post(`/api/projects/${project.id}/tracking`, {
    data: { mainBranch: "main", hideMerged: false, showBranches: true },
  })
  expect(tracking.ok()).toBeTruthy()
  await page.addInitScript((id) => {
    localStorage.setItem("redpact:language", "en")
    localStorage.setItem("redpact:project", id)
  }, project.id)
  await page.goto("/")
  const navigation = async (name) => {
    const button = page.getByRole("button", { name, exact: true })
    if (!(await button.isVisible()) || (await button.boundingBox())?.x < 0) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click()
    }
    await button.click()
    await page.keyboard.press("Escape")
  }
  const image = (name) => page.getByRole("img", { name, exact: true })
  const decoded = async (name) => {
    await expect(image(name)).toBeVisible()
    await expect
      .poll(() => image(name).evaluate((node) => node.complete && node.naturalWidth > 0))
      .toBe(true)
  }
  for (const width of [1440, 390]) {
    await test.step(`${width}px 파일 미리보기와 원본 전환`, async () => {
      await page.setViewportSize({ width, height: 900 })
      await navigation("File Viewer")
      for (const path of ["icon.svg", "picture.png", "favicon.ico"]) {
        await page.getByRole("treeitem", { name: path, exact: true }).click()
        await decoded(path)
        if (path.endsWith("svg")) {
          await page.getByRole("tab", { name: "Source", exact: true }).click()
          await expect(page.locator(".diff-source")).toContainText('fill="purple"')
          await page.getByRole("tab", { name: "Preview", exact: true }).click()
          await decoded(path)
          await test.info().attach(`파일 미리보기 ${width}px`, {
            body: await page.screenshot(),
            contentType: "image/png",
          })
        }
      }
      await page.getByRole("treeitem", { name: "broken.png", exact: true }).click()
      await expect(page.getByText("This image could not be decoded.")).toBeVisible()
      await page.getByRole("treeitem", { name: "oversize.png", exact: true }).click()
      await expect(page.getByText("This image exceeds the 5 MiB preview limit.")).toBeVisible()
      await page.getByRole("treeitem", { name: "notes.txt", exact: true }).click()
      await expect(page.locator(".diff-source")).toContainText("Image viewer text fallback")
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    })
    await test.step(`${width}px 워크트리 이미지 비교`, async () => {
      await navigation("image-review")
      await page.getByRole("tab", { name: "Diff", exact: true }).click()
      await page.getByRole("treeitem", { name: /icon.svg/ }).click()
      await decoded("After: icon.svg")
      await decoded("Before: icon.svg")
      await test.info().attach(`이미지 비교 ${width}px`, {
        body: await page.screenshot(),
        contentType: "image/png",
      })
      await page.getByRole("tab", { name: "Source", exact: true }).click()
      await expect(page.locator(".diff-code-insert")).toContainText('fill="purple"')
      await page.getByRole("tab", { name: "Preview", exact: true }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      )
    })
    await test.step(`${width}px 스테이징·작업 파일의 독립적인 이미지 비교`, async () => {
      await page.getByRole("button", { name: /^Uncommitted changes/ }).click()
      const dialog = page.getByRole("dialog")
      await dialog.getByRole("treeitem", { name: /icon.svg/ }).click()
      for (const [label, before, after] of [
        ["Staged", "blue", "green"],
        ["Unstaged and untracked", "green", "purple"],
      ]) {
        const region = dialog.getByRole("region", { name: label, exact: true })
        for (const [side, color] of [
          ["Before", before],
          ["After", after],
        ]) {
          const preview = region.getByRole("img", { name: `${side}: icon.svg`, exact: true })
          await preview.scrollIntoViewIfNeeded()
          await expect(preview).toBeInViewport()
          expect(
            Buffer.from((await preview.getAttribute("src")).split(",")[1], "base64").toString(),
          ).toContain(`fill="${color}"`)
        }
      }
      await test.info().attach(`미커밋 이미지 비교 ${width}px`, {
        body: await page.screenshot(),
        contentType: "image/png",
      })
      await dialog.getByRole("button", { name: "Close", exact: true }).first().click()
    })
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await navigation("image-history")
    await page.getByRole("treeitem", { name: /icon.svg/ }).click()
    await decoded("After: icon.svg")
    expect(
      Buffer.from(
        (await image("After: icon.svg").getAttribute("src")).split(",")[1],
        "base64",
      ).toString(),
    ).toContain('fill="blue"')
    await test.info().attach(`브랜치 이미지 비교 ${width}px`, {
      body: await page.screenshot(),
      contentType: "image/png",
    })
    await navigation("Git Graph")
    await page.getByText("Update image artwork", { exact: true }).click()
    await decoded("After: icon.svg")
    await test.info().attach(`커밋 이미지 비교 ${width}px`, {
      body: await page.screenshot(),
      contentType: "image/png",
    })
    await page.getByRole("tab", { name: "Source", exact: true }).click()
    await expect(page.locator(".diff-code-insert")).toContainText('fill="blue"')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    )
  }
})
