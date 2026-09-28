<?php

declare(strict_types=1);

namespace AnuBit\Pageflipper\DataProcessing;

use Psr\Log\LoggerAwareInterface;
use Psr\Log\LoggerAwareTrait;
use TYPO3\CMS\Core\Imaging\ImageManipulation\CropVariantCollection;
use TYPO3\CMS\Core\Resource\FileInterface;
use TYPO3\CMS\Core\Resource\FileReference;
use TYPO3\CMS\Core\Resource\ProcessedFile;
use TYPO3\CMS\Core\Utility\GeneralUtility;
use TYPO3\CMS\Core\Utility\MathUtility;
use TYPO3\CMS\Frontend\ContentObject\ContentObjectRenderer;
use TYPO3\CMS\Frontend\ContentObject\DataProcessorInterface;
use TYPO3\CMS\Frontend\Resource\FileCollector;

/**
 * Prepares the PDFs and viewer settings of a PageFlipper content element.
 *
 * Example:
 *
 * dataProcessing.10 = pageflipper
 * dataProcessing.10 {
 *     references.fieldName = tx_pageflipper_files
 *     cover.width = 480
 *     cover.fileExtension = webp
 *     pdfThumbnails = 1
 *     as = pageflipper
 * }
 *
 * Cover resolution order per PDF:
 *   1. custom cover image of the file reference (tx_pageflipper_cover)
 *   2. server-side PDF thumbnail, if TYPO3 image processing is able to create one
 *   3. none (the template renders a generic placeholder)
 */
final class PageFlipperProcessor implements DataProcessorInterface, LoggerAwareInterface
{
    use LoggerAwareTrait;

    private const LAYOUTS = ['covers', 'tiles', 'cards'];

    public function process(
        ContentObjectRenderer $cObj,
        array $contentObjectConfiguration,
        array $processorConfiguration,
        array $processedData
    ): array {
        if (isset($processorConfiguration['if.']) && !$cObj->checkIf($processorConfiguration['if.'])) {
            return $processedData;
        }

        $record = $processedData['data'] ?? $cObj->data;
        $fieldName = (string)$cObj->stdWrapValue('fieldName', $processorConfiguration['references.'] ?? [], 'tx_pageflipper_files');
        $coverConfiguration = $processorConfiguration['cover.'] ?? [];
        $pdfThumbnails = (bool)$cObj->stdWrapValue('pdfThumbnails', $processorConfiguration, 1);

        $fileCollector = GeneralUtility::makeInstance(FileCollector::class);
        $fileCollector->addFilesFromRelation('tt_content', $fieldName, $record);

        $items = [];
        foreach ($fileCollector->getFiles() as $fileReference) {
            if (!$fileReference instanceof FileReference || strtolower($fileReference->getExtension()) !== 'pdf') {
                continue;
            }
            $items[] = $this->buildItem($fileReference, $cObj, $coverConfiguration, $pdfThumbnails);
        }

        $targetVariableName = (string)$cObj->stdWrapValue('as', $processorConfiguration, 'pageflipper');
        $processedData[$targetVariableName] = [
            'items' => $items,
            'settings' => $this->buildSettings($record),
        ];

        return $processedData;
    }

    private function buildItem(FileReference $fileReference, ContentObjectRenderer $cObj, array $coverConfiguration, bool $pdfThumbnails): array
    {
        $title = trim((string)$fileReference->getTitle());
        if ($title === '') {
            // "B1_adults-set_2024" -> "B1 adults set 2024"
            $title = trim((string)preg_replace('/[\s_-]+/', ' ', $fileReference->getNameWithoutExtension()));
        }

        $cover = null;
        $coverFile = $this->findCustomCover($fileReference);
        if ($coverFile !== null) {
            $cover = $this->processCover($coverFile, $cObj, $coverConfiguration, 'custom');
        }
        if ($cover === null && $pdfThumbnails && $this->isPdfThumbnailSupported()) {
            $cover = $this->processCover($fileReference, $cObj, $coverConfiguration, 'thumbnail');
        }

        return [
            'file' => $fileReference,
            'uid' => $fileReference->getUid(),
            'title' => $title,
            'description' => trim((string)$fileReference->getDescription()),
            'url' => (string)$fileReference->getPublicUrl(),
            'size' => (int)$fileReference->getSize(),
            'cover' => $cover,
            'coverFile' => $coverFile,
        ];
    }

    private function buildSettings(array $record): array
    {
        $layout = (string)($record['tx_pageflipper_layout'] ?? '');
        if (!in_array($layout, self::LAYOUTS, true)) {
            $layout = self::LAYOUTS[0];
        }

        return [
            'layout' => $layout,
            // Partial name below Partials/PageFlipper/Item/
            'itemPartial' => ucfirst($layout),
            'showTitles' => (bool)($record['tx_pageflipper_show_titles'] ?? true),
            'columns' => MathUtility::forceIntegerInRange((int)($record['tx_pageflipper_columns'] ?? 3), 1, 4, 3),
            'pageMode' => ($record['tx_pageflipper_page_mode'] ?? '') === 'single' ? 'single' : 'double',
            'navigation' => (bool)($record['tx_pageflipper_navigation'] ?? true),
            'fullscreen' => (bool)($record['tx_pageflipper_fullscreen'] ?? true),
            'zoom' => (bool)($record['tx_pageflipper_zoom'] ?? true),
            'download' => (bool)($record['tx_pageflipper_download'] ?? true),
            'assetVersion' => $this->getAssetVersion(),
        ];
    }

    /**
     * Cache-busting value for the lazily imported viewer modules: the loader's own URL
     * only changes when the loader itself changes, not when one of its imports does.
     */
    private function getAssetVersion(): string
    {
        $directory = GeneralUtility::getFileAbsFileName('EXT:pageflipper/Resources/Public/JavaScript/');
        $modificationTimes = array_map('filemtime', glob($directory . '*.js') ?: []);

        return $modificationTimes === [] ? '' : (string)max($modificationTimes);
    }

    private function findCustomCover(FileReference $fileReference): ?FileReference
    {
        $fileCollector = GeneralUtility::makeInstance(FileCollector::class);
        $fileCollector->addFilesFromRelation('sys_file_reference', 'tx_pageflipper_cover', $fileReference->getReferenceProperties());
        $cover = $fileCollector->getFiles()[0] ?? null;

        return $cover instanceof FileReference ? $cover : null;
    }

    /**
     * Returns null whenever no usable image could be created, so the template can fall back to a placeholder.
     */
    private function processCover(FileInterface $file, ContentObjectRenderer $cObj, array $configuration, string $source): ?array
    {
        $instructions = [];
        foreach (['width', 'height', 'maxWidth', 'maxHeight'] as $key) {
            $value = (string)$cObj->stdWrapValue($key, $configuration);
            if ($value !== '') {
                $instructions[$key] = $value;
            }
        }
        if ($instructions === []) {
            $instructions['width'] = '480';
        }
        $fileExtension = (string)$cObj->stdWrapValue('fileExtension', $configuration);
        if ($fileExtension !== '' && GeneralUtility::inList((string)($GLOBALS['TYPO3_CONF_VARS']['GFX']['imagefile_ext'] ?? ''), $fileExtension)) {
            $instructions['fileExtension'] = $fileExtension;
        }
        if ($source === 'custom' && $file instanceof FileReference) {
            $cropVariant = (string)$cObj->stdWrapValue('cropVariant', $configuration, 'default');
            $cropArea = CropVariantCollection::create((string)$file->getProperty('crop'))->getCropArea($cropVariant);
            if (!$cropArea->isEmpty()) {
                $instructions['crop'] = $cropArea->makeAbsoluteBasedOnFile($file);
            }
        }

        $originalFile = $file instanceof FileReference ? $file->getOriginalFile() : $file;
        try {
            $processedFile = $originalFile->process(ProcessedFile::CONTEXT_IMAGECROPSCALEMASK, $instructions);
        } catch (\Throwable $e) {
            $this->logger?->warning('PageFlipper: could not create cover for file {file}: {message}', [
                'file' => $originalFile->getIdentifier(),
                'message' => $e->getMessage(),
            ]);
            return null;
        }

        // A failed PDF conversion falls back to the original PDF, which is not usable as <img> source
        if ($source === 'thumbnail'
            && ($processedFile->usesOriginalFile() || strtolower($processedFile->getExtension()) === 'pdf')
        ) {
            return null;
        }
        if (!$processedFile->exists()) {
            return null;
        }
        $url = $processedFile->getPublicUrl();
        if ($url === null || $url === '') {
            return null;
        }

        return [
            'url' => $url,
            'width' => (int)$processedFile->getProperty('width'),
            'height' => (int)$processedFile->getProperty('height'),
            'alternative' => $file instanceof FileReference ? trim((string)$file->getAlternative()) : '',
            'source' => $source,
        ];
    }

    private function isPdfThumbnailSupported(): bool
    {
        $gfx = $GLOBALS['TYPO3_CONF_VARS']['GFX'] ?? [];

        return !empty($gfx['processor_enabled'])
            && GeneralUtility::inList(strtolower((string)($gfx['imagefile_ext'] ?? '')), 'pdf');
    }
}
