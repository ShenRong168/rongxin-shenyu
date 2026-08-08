import AppKit

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    fputs("Usage: render_im_fine_quote_card <input.png> <output.png>\n", stderr)
    exit(2)
}

let inputURL = URL(fileURLWithPath: arguments[1])
let outputURL = URL(fileURLWithPath: arguments[2])
let canvasSize = NSSize(width: 1080, height: 1350)

guard let source = NSImage(contentsOf: inputURL) else {
    fputs("Could not load input image.\n", stderr)
    exit(1)
}

let image = NSImage(size: canvasSize)
image.lockFocus()
source.draw(in: NSRect(origin: .zero, size: canvasSize), from: NSRect(origin: .zero, size: source.size), operation: .copy, fraction: 1)

let ink = NSColor(calibratedRed: 0x17 / 255.0, green: 0x3E / 255.0, blue: 0x35 / 255.0, alpha: 1)
let gold = NSColor(calibratedRed: 0xC9 / 255.0, green: 0xA8 / 255.0, blue: 0x6A / 255.0, alpha: 1)
let ivory = NSColor(calibratedRed: 0xF6 / 255.0, green: 0xF0 / 255.0, blue: 0xE5 / 255.0, alpha: 1)

let quote = "你說沒事，\n不代表真的沒事。"
let quoteParagraph = NSMutableParagraphStyle()
quoteParagraph.alignment = .center
quoteParagraph.lineSpacing = 20
let quoteAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "Songti TC", size: 68) ?? NSFont(name: "PingFangTC-Semibold", size: 68) ?? NSFont.systemFont(ofSize: 68, weight: .semibold),
    .foregroundColor: ink,
    .paragraphStyle: quoteParagraph,
    .kern: 1.5
]
(quote as NSString).draw(with: NSRect(x: 165, y: 610, width: 750, height: 220), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: quoteAttributes)

let separator = NSBezierPath()
separator.move(to: NSPoint(x: 470, y: 570))
separator.line(to: NSPoint(x: 610, y: 570))
gold.setStroke()
separator.lineWidth = 2
separator.stroke()

let tagRect = NSRect(x: 30, y: 50, width: 226, height: 92)
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
("榮心紳語" as NSString).draw(with: NSRect(x: 39, y: 97, width: 208, height: 30), options: [.usesLineFragmentOrigin], attributes: brandAttributes)
let englishAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "Avenir Next", size: 12) ?? NSFont.systemFont(ofSize: 12),
    .foregroundColor: ivory,
    .paragraphStyle: brandParagraph,
    .kern: 0.5
]
("InnerDialogueStudio" as NSString).draw(with: NSRect(x: 39, y: 72, width: 208, height: 20), options: [.usesLineFragmentOrigin], attributes: englishAttributes)

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Could not encode PNG.\n", stderr)
    exit(1)
}
try png.write(to: outputURL)
