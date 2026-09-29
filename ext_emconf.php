<?php

$EM_CONF[$_EXTKEY] = [
    'title' => 'PageFlipper',
    'description' => 'Content element that displays FAL PDFs as a responsive collection of lazy-loaded flipbooks (PDF.js + StPageFlip).',
    'category' => 'fe',
    'author' => 'Anu Bhuvanendran Nair',
    'author_company' => 'AnuBit',
    'state' => 'stable',
    'version' => '1.1.0',
    'constraints' => [
        'depends' => [
            'typo3' => '12.4.0-13.4.99',
        ],
        'conflicts' => [],
        'suggests' => [],
    ],
];
