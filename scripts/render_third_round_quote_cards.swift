import AppKit

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    fputs("Usage: render_third_round_quote_cards <output-name> <output.png>\n", stderr)
    exit(2)
}

let sourceURL = URL(fileURLWithPath: "tmp/imagegen/used-to-it-background-1080x1350.png")
let cardName = arguments[1]
let outputURL = URL(fileURLWithPath: arguments[2])
let canvasSize = NSSize(width: 1080, height: 1350)

guard let source = NSImage(contentsOf: sourceURL) else {
    fputs("Could not load the approved card background.\n", stderr)
    exit(1)
}

struct CardSpec {
    let quote: String
    let fontSize: CGFloat
    let rect: NSRect
    let separatorY: CGFloat
}

let specs: [String: CardSpec] = [
    "listening-blank-quote": CardSpec(
        quote: "你最想跟他說的\n第一句話是什麼？",
        fontSize: 61,
        rect: NSRect(x: 145, y: 555, width: 790, height: 250),
        separatorY: 505
    ),
    "listen-to-yourself-quote": CardSpec(
        quote: "你很習慣聽別人說話，\n但你有多久沒好好\n聽自己說話？",
        fontSize: 48,
        rect: NSRect(x: 125, y: 500, width: 830, height: 330),
        separatorY: 455
    ),
    "companionship-not-solutions-quote": CardSpec(
        quote: "被好好聽完的感覺，\n會讓人有力氣\n繼續面對。",
        fontSize: 58,
        rect: NSRect(x: 135, y: 535, width: 810, height: 330),
        separatorY: 485
    )
]

guard let spec = specs[cardName] else {
    fputs("Unknown card name: \(cardName)\n", stderr)
    exit(2)
}

let image = NSImage(size: canvasSize)
image.lockFocus()
source.draw(in: NSRect(origin: .zero, size: canvasSize), from: NSRect(origin: .zero, size: source.size), operation: .copy, fraction: 1)

let ink = NSColor(calibratedRed: 0x17 / 255.0, green: 0x3E / 255.0, blue: 0x35 / 255.0, alpha: 1)
let gold = NSColor(calibratedRed: 0xC9 / 255.0, green: 0xA8 / 255.0, blue: 0x6A / 255.0, alpha: 1)
let ivory = NSColor(calibratedRed: 0xF6 / 255.0, green: 0xF0 / 255.0, blue: 0xE5 / 255.0, alpha: 1)

let quoteParagraph = NSMutableParagraphStyle()
quoteParagraph.alignment = .center
quoteParagraph.lineSpacing = 17
let quoteAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "Songti TC", size: spec.fontSize) ?? NSFont(name: "PingFangTC-Semibold", size: spec.fontSize) ?? NSFont.systemFont(ofSize: spec.fontSize, weight: .semibold),
    .foregroundColor: ink,
    .paragraphStyle: quoteParagraph,
    .kern: 1.2
]
(spec.quote as NSString).draw(with: spec.rect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: quoteAttributes)

let separator = NSBezierPath()
separator.move(to: NSPoint(x: 470, y: spec.separatorY))
separator.line(to: NSPoint(x: 610, y: spec.separatorY))
gold.setStroke()
separator.lineWidth = 2
separator.stroke()

let tagRect = NSRect(x: 51, y: 50, width: 226, height: 92)
ink.setFill()
NSBezierPath(roundedRect: tagRect, xRadius: 39, yRadius: 39).fill()
gold.setStroke()
let tagBorder = NSBezierPath(roundedRect: tagRect.insetBy(dx: 1.5, dy: 1.5), xRadius: 37, yRadius: 37)
tagBorder.lineWidth = 2
tagBorder.stroke()

let brandParagraph = NSMutableParagraphStyle()
brandParagraph.alignment = .center
let brandAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "PingFangTC-Medium", size: 24) ?? NSFont.systemFont(ofSize: 24, weight: .medium),
    .foregroundColor: ivory,
    .paragraphStyle: brandParagraph,
    .kern: 2.1
]
("榮心紳語" as NSString).draw(with: NSRect(x: 60, y: 97, width: 208, height: 30), options: [.usesLineFragmentOrigin], attributes: brandAttributes)
let englishAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "Avenir Next", size: 12) ?? NSFont.systemFont(ofSize: 12),
    .foregroundColor: ivory,
    .paragraphStyle: brandParagraph,
    .kern: 0.5
]
("InnerDialogueStudio" as NSString).draw(with: NSRect(x: 60, y: 72, width: 208, height: 20), options: [.usesLineFragmentOrigin], attributes: englishAttributes)

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Could not encode PNG.\n", stderr)
    exit(1)
}
try png.write(to: outputURL)
