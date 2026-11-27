export default async function run(page, ui) {
  const snap = await ui.snapshot()
  const name = snap.match(/@(e\d+) textbox "VENDOR NAME/)?.[1]
  if (name) await ui.fill(name, 'Audit Vendor')
  const cat = snap.match(/@(e\d+) button "Fruits/)?.[1]
  if (cat) await ui.click(cat)
  await page.waitForTimeout(400)
  const snap2 = await ui.snapshot()
  const enter = snap2.match(/@(e\d+) button "Open my stall/)?.[1]
  if (enter) await ui.click(enter)
  await page.waitForTimeout(8000)
  return { after: (await ui.snapshot()).slice(0, 4000) }
}
