// caras.swift — dónde está la cara en el video (una muestra cada medio segundo) para que ninguna animación la tape.
// Con --texto también lee el texto que aparece en pantalla (para medir un video de referencia).
// Con --preciso lee ese texto con el modo lento de Vision: hace falta para números con color, brillo o borde
// (el modo rápido los lee como basura). Solo mira letras de más de 3 % del alto.
// Usa Vision de macOS: no hay que instalar nada más que las herramientas de línea de comandos de Xcode
// (vienen con Homebrew).
//
//   caras <video.mp4> <salida.json> [cada_segundos] [--texto] [--preciso] [--hasta segundos]
// Salida: { "muestras": [ { "t": 0, "caja": [x, y, w, h], "textos": [ { "t": "HOLA", "caja": [...], "c": 0.9 } ] } ] }
// (valores 0-1, origen arriba a la izquierda)
import Foundation
import AVFoundation
import Vision

let args = CommandLine.arguments
guard args.count >= 3 else {
    FileHandle.standardError.write("Uso: caras <video> <salida.json> [cada_segundos] [--texto] [--preciso] [--hasta segundos]\n".data(using: .utf8)!)
    exit(2)
}
let url = URL(fileURLWithPath: args[1])
let salida = URL(fileURLWithPath: args[2])
var paso = 1.0
var conTexto = false
var preciso = false
var hasta = Double.infinity
var i = 3
while i < args.count {
    let a = args[i]
    if a == "--texto" { conTexto = true }
    else if a == "--preciso" { preciso = true }
    else if a == "--hasta", i + 1 < args.count { hasta = Double(args[i + 1]) ?? hasta; i += 1 }
    else if let n = Double(a) { paso = n }
    i += 1
}

let asset = AVURLAsset(url: url)
let dur = min(CMTimeGetSeconds(asset.duration), hasta)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.maximumSize = CGSize(width: 960, height: 960)
gen.requestedTimeToleranceBefore = CMTime(seconds: 0.05, preferredTimescale: 600)
gen.requestedTimeToleranceAfter = CMTime(seconds: 0.05, preferredTimescale: 600)

let r3 = { (v: Double) in (v * 1000).rounded() / 1000 }
var muestras: [[String: Any]] = []
var t = 0.0
while t < dur {
    let tiempo = CMTime(seconds: t, preferredTimescale: 600)
    var entrada: [String: Any] = ["t": (t * 100).rounded() / 100]
    if let img = try? gen.copyCGImage(at: tiempo, actualTime: nil) {
        let handler = VNImageRequestHandler(cgImage: img, options: [:])
        let req = VNDetectFaceRectanglesRequest()
        var pedidos: [VNRequest] = [req]
        let reqTexto = VNRecognizeTextRequest()
        if conTexto {
            reqTexto.recognitionLevel = preciso ? .accurate : .fast
            reqTexto.usesLanguageCorrection = false
            reqTexto.minimumTextHeight = preciso ? 0.03 : 0.025
            if let idiomas = try? reqTexto.supportedRecognitionLanguages() {
                let quiero = ["es-ES", "en-US", "pt-BR"].filter { idiomas.contains($0) }
                if !quiero.isEmpty { reqTexto.recognitionLanguages = quiero }
            }
            pedidos.append(reqTexto)
        }
        try? handler.perform(pedidos)
        let caras = (req.results ?? []).sorted { $0.boundingBox.width * $0.boundingBox.height > $1.boundingBox.width * $1.boundingBox.height }
        if let c = caras.first {
            let b = c.boundingBox
            entrada["caja"] = [r3(Double(b.minX)), r3(Double(1 - b.maxY)), r3(Double(b.width)), r3(Double(b.height))]
        }
        if conTexto {
            var textos: [[String: Any]] = []
            for obs in reqTexto.results ?? [] {
                guard let cand = obs.topCandidates(1).first, cand.confidence >= 0.3 else { continue }
                let b = obs.boundingBox
                textos.append(["t": cand.string, "caja": [r3(Double(b.minX)), r3(Double(1 - b.maxY)), r3(Double(b.width)), r3(Double(b.height))], "c": r3(Double(cand.confidence))])
            }
            entrada["textos"] = textos
        }
    }
    muestras.append(entrada)
    t += paso
}
let json: [String: Any] = ["fuente": "vision", "duracion": dur, "cada": paso, "preciso": preciso, "muestras": muestras]
let data = try! JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted])
try! data.write(to: salida)
let conCara = muestras.filter { $0["caja"] != nil }.count
print("✅ Caras: \(conCara) de \(muestras.count) muestras con cara")
