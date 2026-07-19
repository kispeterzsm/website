(() => {
    "use strict";

    const PAGE_WIDTH = 595;
    const PAGE_HEIGHT = 842;
    const MARGIN = 52;
    const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
    const TOP = 790;
    const BOTTOM = 48;

    const cleanText = (value) => (value || "").replace(/\s+/g, " ").trim();

    function directText(element, selector) {
        const child = element.querySelector(selector);
        return child ? cleanText(child.textContent) : "";
    }

    function extractIntroduction(about, email) {
        const paragraph = about.querySelector(":scope > p");
        if (!paragraph) return "";

        const text = cleanText(paragraph.textContent);
        const contactIndex = email ? text.indexOf(email) : -1;
        if (contactIndex < 0) return text;

        const precedingSentence = text.lastIndexOf(".", contactIndex);
        return precedingSentence >= 0
            ? text.slice(0, precedingSentence + 1)
            : text.slice(0, contactIndex);
    }

    function extractCards(section) {
        if (!section) return [];

        return Array.from(section.querySelectorAll(":scope > .card-container > .card"))
            .map((card) => {
                const heading = directText(card, "h3");
                const dateElement = card.querySelector("em");
                const date = dateElement ? cleanText(dateElement.textContent) : "";
                const details = Array.from(card.querySelectorAll(".card-text p, :scope > p"))
                    .filter((paragraph) => !paragraph.querySelector("em"))
                    .map((paragraph) => cleanText(paragraph.textContent))
                    .filter((text) => text && text !== date);

                return { heading, date, details };
            })
            .filter((item) => item.heading);
    }

    function extractSkills(about) {
        return Array.from(about.querySelectorAll(":scope > .card-container > .card"))
            .map((card) => ({
                heading: directText(card, "h3"),
                values: Array.from(card.querySelectorAll("li"))
                    .map((item) => cleanText(item.textContent))
                    .filter(Boolean)
            }))
            .filter((group) => group.heading && group.values.length);
    }

    function latestYear(item) {
        const years = `${item.date} ${item.details.join(" ")}`.match(/\b(19|20)\d{2}\b/g);
        return years ? Math.max(...years.map(Number)) : 0;
    }

    function readCvFromPage() {
        const about = document.querySelector("#about");
        const mailLink = document.querySelector('a[href^="mailto:"]');
        const linkedIn = document.querySelector('a[href*="linkedin.com"]');
        const email = mailLink
            ? cleanText(mailLink.getAttribute("href").replace(/^mailto:/, ""))
            : "";

        const education = extractCards(document.querySelector("#studies"))
            .sort((a, b) => latestYear(b) - latestYear(a));

        return {
            language: document.documentElement.lang || "en",
            name: directText(document, "header h1"),
            title: directText(document, "header .tagline"),
            email,
            linkedIn: linkedIn ? linkedIn.href : "",
            summary: extractIntroduction(about, email),
            skills: extractSkills(about),
            experience: extractCards(document.querySelector("#experience")),
            education,
            projects: extractCards(document.querySelector("#projects")),
            research: extractCards(document.querySelector("#research"))
        };
    }

    function normalizeForPdf(value) {
        return value
            .replace(/\u00a0/g, " ")
            .replace(/[‐‑‒–—]/g, "-")
            .replace(/[‘’]/g, "'")
            .replace(/[“”]/g, '"')
            .replace(/…/g, "...")
            .replace(/[^\x20-\x7e\u00a0-\u00ff\u0150\u0151\u0170\u0171\u20ac]/g, "");
    }

    const winAnsiCodes = new Map([
        ["€", 128], ["‚", 130], ["ƒ", 131], ["„", 132], ["…", 133],
        ["†", 134], ["‡", 135], ["ˆ", 136], ["‰", 137], ["Š", 138],
        ["‹", 139], ["Œ", 140], ["Ž", 142], ["‘", 145], ["’", 146],
        ["“", 147], ["”", 148], ["•", 149], ["–", 150], ["—", 151],
        ["˜", 152], ["™", 153], ["š", 154], ["›", 155], ["œ", 156],
        ["ž", 158], ["Ÿ", 159], ["Ő", 129], ["ő", 141], ["Ű", 143],
        ["ű", 157]
    ]);

    function pdfString(value) {
        let encoded = "";

        for (const character of normalizeForPdf(value)) {
            const code = winAnsiCodes.get(character) ?? character.charCodeAt(0);
            if (character === "\\" || character === "(" || character === ")") {
                encoded += `\\${character}`;
            } else if (code < 32 || code > 126) {
                encoded += `\\${code.toString(8).padStart(3, "0")}`;
            } else {
                encoded += character;
            }
        }

        return encoded;
    }

    function approximateWidth(text, fontSize, bold = false) {
        let units = 0;
        for (const character of text) {
            if ("ilI.,'!:;|".includes(character)) units += 0.27;
            else if ("MW@%&".includes(character)) units += 0.9;
            else if (character === " ") units += 0.28;
            else units += 0.53;
        }
        return units * fontSize * (bold ? 1.04 : 1);
    }

    function wrapText(text, fontSize, maxWidth, bold = false) {
        const words = cleanText(text).split(" ");
        const lines = [];
        let line = "";

        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (line && approximateWidth(candidate, fontSize, bold) > maxWidth) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }

        if (line) lines.push(line);
        return lines;
    }

    function buildPdf(cv) {
        const pages = [[]];
        let pageIndex = 0;
        let y = TOP;

        const currentPage = () => pages[pageIndex];

        function newPage() {
            pages.push([]);
            pageIndex += 1;
            y = TOP;
        }

        function ensureSpace(height) {
            if (y - height < BOTTOM) newPage();
        }

        function line(text, options = {}) {
            const {
                size = 9.5,
                bold = false,
                indent = 0,
                gap = 3,
                leading = size * 1.32,
                keepWithNext = false
            } = options;
            const x = MARGIN + indent;
            const lines = wrapText(text, size, CONTENT_WIDTH - indent, bold);
            const needed = Math.max(leading, lines.length * leading) + gap;
            ensureSpace(needed + (keepWithNext ? 18 : 0));

            for (const wrappedLine of lines) {
                currentPage().push(
                    `BT /${bold ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${pdfString(wrappedLine)}) Tj ET`
                );
                y -= leading;
            }
            y -= gap;
        }

        function divider() {
            currentPage().push(`0.72 G 0.6 w ${MARGIN} ${y} m ${PAGE_WIDTH - MARGIN} ${y} l S 0 G`);
            y -= 10;
        }

        function sectionHeading(title) {
            ensureSpace(32);
            y -= 4;
            line(title.toUpperCase(), { size: 11.5, bold: true, gap: 2, keepWithNext: true });
            divider();
        }

        function entries(title, items) {
            if (!items.length) return;
            sectionHeading(title);

            items.forEach((item) => {
                ensureSpace(36);
                line(item.heading, { size: 10.2, bold: true, gap: 0, keepWithNext: true });
                if (item.date) line(item.date, { size: 8.8, gap: 2 });
                item.details.forEach((detail) => {
                    line(`- ${detail}`, { size: 9.2, indent: 8, gap: 2 });
                });
                y -= 3;
            });
        }

        line(cv.name, { size: 20, bold: true, gap: 1 });
        line(cv.title, { size: 11.5, bold: true, gap: 3 });
        const contact = [cv.email, cv.linkedIn].filter(Boolean).join(" | ");
        if (contact) line(contact, { size: 9, gap: 6 });
        divider();

        const labels = cv.language.toLowerCase().startsWith("hu")
            ? {
                summary: "Szakmai összefoglaló",
                skills: "Készségek",
                experience: "Szakmai tapasztalat",
                education: "Tanulmányok",
                projects: "Kiemelt projektek",
                research: "Kutatás"
            }
            : {
                summary: "Professional Summary",
                skills: "Skills",
                experience: "Professional Experience",
                education: "Education",
                projects: "Selected Projects",
                research: "Research"
            };

        if (cv.summary) {
            sectionHeading(labels.summary);
            line(cv.summary, { size: 9.5, gap: 2 });
        }

        if (cv.skills.length) {
            sectionHeading(labels.skills);
            cv.skills.forEach((group) => {
                line(`${group.heading}: ${group.values.join("; ")}`, {
                    size: 9.2,
                    bold: false,
                    gap: 3
                });
            });
        }

        entries(labels.experience, cv.experience);
        entries(labels.education, cv.education);
        entries(labels.projects, cv.projects);
        entries(labels.research, cv.research);

        pages.forEach((commands, index) => {
            commands.push(
                `BT /F1 8 Tf 1 0 0 1 ${PAGE_WIDTH / 2 - 18} 25 Tm (${index + 1} / ${pages.length}) Tj ET`
            );
        });

        const objects = [];
        const addObject = (content) => {
            objects.push(content);
            return objects.length;
        };

        addObject("<< /Type /Catalog /Pages 2 0 R >>");
        addObject("");
        const encoding = "<< /BaseEncoding /WinAnsiEncoding /Differences " +
            "[129 /Ohungarumlaut 141 /ohungarumlaut 143 /Uhungarumlaut 157 /uhungarumlaut] >>";
        addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding ${encoding} >>`);
        addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding ${encoding} >>`);

        const pageObjectIds = [];
        pages.forEach((commands) => {
            const pageObjectId = objects.length + 1;
            const streamObjectId = pageObjectId + 1;
            pageObjectIds.push(pageObjectId);
            addObject(
                `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
                `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamObjectId} 0 R >>`
            );
            const stream = commands.join("\n");
            addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
        });

        objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

        let pdf = "%PDF-1.4\n%PDFJS\n";
        const offsets = [0];
        objects.forEach((object, index) => {
            offsets.push(pdf.length);
            pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });

        const xrefOffset = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n`;
        pdf += "0000000000 65535 f \n";
        offsets.slice(1).forEach((offset) => {
            pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
        });
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
        pdf += `startxref\n${xrefOffset}\n%%EOF`;

        return new Blob([new TextEncoder().encode(pdf)], { type: "application/pdf" });
    }

    function downloadCv(button) {
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = button.dataset.generatingLabel || "Generating PDF...";

        try {
            const cv = readCvFromPage();
            const blob = buildPdf(cv);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            const languageSuffix = cv.language.toLowerCase().startsWith("hu") ? "-hu" : "";

            link.href = url;
            link.download = `${cv.name.replace(/\s+/g, "-").toLowerCase()}-cv${languageSuffix}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } finally {
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    if (typeof document !== "undefined") {
        document.addEventListener("DOMContentLoaded", () => {
            const button = document.querySelector("[data-cv-download]");
            if (button) button.addEventListener("click", () => downloadCv(button));
        });
    }

    if (typeof module !== "undefined" && module.exports) {
        module.exports = { buildPdf };
    }
})();
