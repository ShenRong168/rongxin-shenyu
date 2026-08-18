import AppKit

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    fputs("Usage: render_not_yet_let_go_quote_card <input.png> <output.png>\n", stderr)
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

let textColor = NSColor(calibratedRed: 0x17 / 255.0, green: 0x3E / 255.0, blue: 0x35 / 255.0, alpha: 1)
let gold = NSColor(calibratedRed: 0xC9 / 255.0, green: 0xA8 / 255.0, blue: 0x6A / 255.0, alpha: 1)
let ivory = NSColor(calibratedRed: 0xF6 / 255.0, green: 0xF0 / 255.0, blue: 0xE5 / 255.0, alpha: 1)

let quote = "這次的「算了」，\n是真的放下，\n還是又一次沒說出口？"
let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
paragraph.lineSpacing = 16
let quoteAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "PingFangTC-Semibold", size: 56) ?? NSFont.systemFont(ofSize: 56, weight: .semibold),
    .foregroundColor: textColor,
    .paragraphStyle: paragraph,
    .kern: 1.0
]
let quoteRect = NSRect(x: 135, y: 540, width: 810, height: 300)
(quote as NSString).draw(with: quoteRect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: quoteAttributes)

let separator = NSBezierPath()
separator.move(to: NSPoint(x: 470, y: 465))
separator.line(to: NSPoint(x: 610, y: 465))
gold.setStroke()
separator.lineWidth = 2
separator.stroke()

let tagRect = NSRect(x: 76, y: 58, width: 350, height: 54)
textColor.setFill()
NSBezierPath(roundedRect: tagRect, xRadius: 6, yRadius: 6).fill()
let tagParagraph = NSMutableParagraphStyle()
tagParagraph.alignment = .center
let tagAttributes: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "PingFangTC-Medium", size: 21) ?? NSFont.systemFont(ofSize: 21, weight: .medium),
    .foregroundColor: ivory,
    .paragraphStyle: tagParagraph,
    .kern: 1.2
]
("榮心紳語  InnerDialogueStudio" as NSString).draw(with: NSRect(x: 78, y: 72, width: 330, height: 30), options: [.usesLineFragmentOrigin], attributes: tagAttributes)

image.unlockFocus()

guard let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let png = bitmap.representation(using: .png, properties: [:]) else {
    fputs("Could not encode PNG.\n", stderr)
    exit(1)
}
try png.write(to: outputURL)
